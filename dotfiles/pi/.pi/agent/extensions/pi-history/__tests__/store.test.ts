import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { searchPrompts } from "../model.ts";
import {
	PiHistoryStore,
	resolvePiHistoryDatabasePath,
	type SessionListing,
	type SessionReader,
} from "../store.ts";

function temporaryDirectory(): string {
	return mkdtempSync(join(tmpdir(), "pi-history-store-"));
}

function userEntry(
	id: string,
	text: string,
	timestamp: number,
	extraContent: unknown[] = [],
): unknown {
	return {
		type: "message",
		id,
		timestamp: new Date(timestamp).toISOString(),
		message: {
			role: "user",
			timestamp,
			content: [{ type: "text", text }, ...extraContent],
		},
	};
}

function listing(
	path: string,
	modified: number,
	name?: string,
	cwd = "/repo",
): SessionListing {
	writeFileSync(path, "");
	utimesSync(path, new Date(modified), new Date(modified));
	return {
		path,
		cwd,
		name,
		modified: new Date(modified),
	};
}

function reader(entries: unknown[]): SessionReader {
	return { getEntries: () => entries };
}

test("database path honors XDG_STATE_HOME and the documented fallback", () => {
	assert.equal(
		resolvePiHistoryDatabasePath({ XDG_STATE_HOME: "/state" }, "/home/tester"),
		"/state/pi/pi-history.sqlite",
	);
	assert.equal(
		resolvePiHistoryDatabasePath({}, "/home/tester"),
		"/home/tester/.local/state/pi/pi-history.sqlite",
	);
});

test("store creates the schema, indexes, and required PRAGMAs", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const store = new PiHistoryStore({
		databasePath: join(root, "state", "db.sqlite"),
	});
	t.after(() => store.close());

	const diagnostics = store.getDiagnostics();
	assert.equal(diagnostics.journalMode, "wal");
	assert.equal(diagnostics.foreignKeys, true);
	assert.equal(diagnostics.busyTimeoutMs, 3_000);
	assert.deepEqual(diagnostics.tables, [
		"history_prompts",
		"session_index",
		"stashes",
	]);
	assert.ok(diagnostics.indexes.includes("idx_history_cwd_timestamp"));
	assert.ok(diagnostics.indexes.includes("idx_stashes_cwd_created"));
	assert.ok(diagnostics.indexes.includes("idx_session_index_cwd"));
});

test("stashes are ordered newest-first and isolated by exact cwd", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	let now = 100;
	const store = new PiHistoryStore({
		databasePath: join(root, "db.sqlite"),
		now: () => now,
	});
	t.after(() => store.close());

	const first = store.insertStash("first", "/repo");
	now = 200;
	const second = store.insertStash("second", "/repo");
	store.insertStash("other", "/repo-other");

	assert.deepEqual(
		store.listStashes("/repo").map((item) => item.text),
		["second", "first"],
	);
	assert.deepEqual(
		store.listStashes("/repo-other").map((item) => item.text),
		["other"],
	);
	assert.equal(store.deleteStash(second, "/repo"), true);
	assert.equal(store.deleteStash(first, "/repo-other"), false);
	assert.deepEqual(
		store.listStashes("/repo").map((item) => item.text),
		["first"],
	);
});

test("apply mutation atomically auto-stashes a draft and pops the selected stash", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	let now = 1;
	const path = join(root, "db.sqlite");
	const store = new PiHistoryStore({ databasePath: path, now: () => now++ });
	t.after(() => store.close());

	const popped = store.insertStash("replacement", "/repo");
	const result = store.mutateForApply({
		cwd: "/repo",
		currentDraft: "unsaved draft",
		replacementText: "replacement",
		poppedStashId: popped,
	});
	assert.deepEqual(result, { autoStashed: true, popped: true });
	assert.deepEqual(
		store.listStashes("/repo").map((item) => item.text),
		["unsaved draft"],
	);

	const same = store.mutateForApply({
		cwd: "/repo",
		currentDraft: "same",
		replacementText: "same",
	});
	assert.deepEqual(same, { autoStashed: false, popped: false });
});

test("apply mutation rolls back the auto-stash when popping fails", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const path = join(root, "db.sqlite");
	const store = new PiHistoryStore({ databasePath: path });
	t.after(() => store.close());
	const popped = store.insertStash("replacement", "/repo");

	const external = new DatabaseSync(path);
	external.exec(`
    CREATE TRIGGER block_pop
    BEFORE DELETE ON stashes
    WHEN OLD.id = ${popped}
    BEGIN
      SELECT RAISE(ABORT, 'blocked pop');
    END;
  `);
	external.close();

	assert.throws(
		() =>
			store.mutateForApply({
				cwd: "/repo",
				currentDraft: "must survive",
				replacementText: "replacement",
				poppedStashId: popped,
			}),
		/blocked pop/,
	);
	assert.deepEqual(
		store.listStashes("/repo").map((item) => item.text),
		["replacement"],
	);
});

test("history merges live session entries by stable path and entry identity", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const sessions = [listing(join(root, "current.jsonl"), 100, "Current")];
	const currentSession = sessions[0];
	assert.ok(currentSession);
	const readers = new Map<string, SessionReader>([
		[
			currentSession.path,
			reader([
				userEntry("same-id", "indexed text", 100),
				userEntry("indexed-only", "older indexed", 90),
			]),
		],
	]);
	const store = new PiHistoryStore({
		databasePath: join(root, "db.sqlite"),
		listSessions: async () => sessions,
		openSession: (path) => {
			const sessionReader = readers.get(path);
			if (!sessionReader) throw new Error(`missing reader for ${path}`);
			return sessionReader;
		},
	});
	t.after(() => store.close());
	await store.refreshHistory("/repo", { force: true });

	const result = store.listHistory("/repo", {
		sessionPath: currentSession.path,
		sessionName: "Current live",
		entries: [
			userEntry("same-id", "live replacement", 200, [{ type: "image" }]),
			userEntry("live-only", "/history", 150),
		],
	});
	assert.deepEqual(
		result.map((item) => [item.id, item.text]),
		[
			["same-id", "live replacement"],
			["live-only", "/history"],
			["indexed-only", "older indexed"],
		],
	);
	assert.equal(result[0]?.hasImages, true);
	assert.deepEqual(store.listHistory("/different"), []);
});

test("refresh throttles per cwd, skips unchanged mtimes, and replaces changed sessions", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	let now = 1_000;
	let listCalls = 0;
	let openCalls = 0;
	let sessions = [listing(join(root, "a.jsonl"), 100, "A")];
	let entries = [userEntry("old", "old prompt", 100)];
	const store = new PiHistoryStore({
		databasePath: join(root, "db.sqlite"),
		now: () => now,
		listSessions: async () => {
			listCalls += 1;
			return sessions;
		},
		openSession: () => {
			openCalls += 1;
			return reader(entries);
		},
	});
	t.after(() => store.close());

	await store.refreshHistory("/repo");
	await store.refreshHistory("/repo");
	assert.equal(listCalls, 1);
	assert.equal(openCalls, 1);

	now += 30_000;
	await store.refreshHistory("/repo");
	assert.equal(listCalls, 2);
	assert.equal(openCalls, 1);

	now += 30_000;
	sessions = [listing(join(root, "a.jsonl"), 200, "A renamed")];
	entries = [userEntry("new", "new prompt", 200)];
	await store.refreshHistory("/repo");
	assert.equal(openCalls, 2);
	assert.deepEqual(
		store.listHistory("/repo").map((item) => item.text),
		["new prompt"],
	);
});

test("refresh indexes SDK session renames with unchanged activity, including after restart", async (t) => {
	const root = temporaryDirectory();
	const agentDirectory = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	const cwd = join(root, "repo");
	const databasePath = join(root, "db.sqlite");
	let store: PiHistoryStore | undefined;
	t.after(async () => {
		await store?.close();
		if (agentDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = agentDirectory;
		rmSync(root, { recursive: true, force: true });
	});

	const created = SessionManager.create(cwd);
	const sessionPath = created.getSessionFile();
	assert.ok(sessionPath);
	writeFileSync(
		sessionPath,
		[created.getHeader(), userEntry("prompt", "Review this code", 100)]
			.map((entry) => JSON.stringify(entry))
			.join("\n") + "\n",
	);
	const session = SessionManager.open(sessionPath);
	session.appendSessionInfo("Legacy audit");
	utimesSync(sessionPath, new Date(1_000), new Date(1_000));
	const initial = (await SessionManager.list(cwd))[0];
	assert.ok(initial);
	assert.equal(initial.modified.getTime(), 100);
	assert.notEqual(initial.modified.getTime(), statSync(sessionPath).mtimeMs);

	store = new PiHistoryStore({ databasePath });
	store.insertStash("saved draft", cwd);
	await store.refreshHistory(cwd);
	assert.equal(store.listHistory(cwd)[0]?.sessionName, "Legacy audit");

	session.appendSessionInfo("Zephyr launch");
	utimesSync(sessionPath, new Date(2_000), new Date(2_000));
	const renamed = (await SessionManager.list(cwd))[0];
	assert.equal(renamed?.name, "Zephyr launch");
	assert.equal(renamed?.modified.getTime(), initial.modified.getTime());
	await store.refreshHistory(cwd, { force: true });
	assert.equal(store.listHistory(cwd)[0]?.sessionName, "Zephyr launch");
	assert.equal(searchPrompts(store.listHistory(cwd), "Zephyr launch").length, 1);
	assert.deepEqual(searchPrompts(store.listHistory(cwd), "Legacy audit"), []);
	assert.deepEqual(store.listHistory(`${cwd}/nested`), []);

	await store.close();
	// Older databases cached SDK activity timestamps in this same column.
	const legacy = new DatabaseSync(databasePath);
	legacy
		.prepare("UPDATE session_index SET modified_ms = ? WHERE session_path = ?")
		.run(initial.modified.getTime(), sessionPath);
	legacy.close();
	session.appendSessionInfo("Quartz release");
	utimesSync(sessionPath, new Date(3_000), new Date(3_000));
	assert.equal(
		(await SessionManager.list(cwd))[0]?.modified.getTime(),
		initial.modified.getTime(),
	);
	store = new PiHistoryStore({ databasePath });
	assert.equal(store.listHistory(cwd)[0]?.sessionName, "Zephyr launch");
	await store.refreshHistory(cwd);
	assert.equal(store.listHistory(cwd)[0]?.sessionName, "Quartz release");
	assert.equal(searchPrompts(store.listHistory(cwd), "Quartz release").length, 1);
	assert.deepEqual(store.listStashes(cwd).map((item) => item.text), ["saved draft"]);
	assert.deepEqual(store.getIndexState(cwd).warnings, []);
});

test("refresh reads a session name changed after SDK listing instead of caching the stale name", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const cwd = "/repo";
	const created = SessionManager.create(cwd, root);
	const path = created.getSessionFile();
	assert.ok(path);
	writeFileSync(
		path,
		[created.getHeader(), userEntry("prompt", "Review this code", 100)]
			.map((entry) => JSON.stringify(entry))
			.join("\n") + "\n",
	);
	const session = SessionManager.open(path);
	session.appendSessionInfo("Legacy audit");
	let rename = true;
	const store = new PiHistoryStore({
		databasePath: join(root, "db.sqlite"),
		listSessions: async (cwd, onProgress) => {
			const sessions = await SessionManager.list(cwd, root, onProgress);
			if (rename) {
				rename = false;
				session.appendSessionInfo("Zephyr launch");
			}
			return sessions;
		},
	});
	t.after(() => store.close());

	await store.refreshHistory(cwd);
	assert.equal(store.listHistory(cwd)[0]?.sessionName, "Zephyr launch");
	assert.equal(searchPrompts(store.listHistory(cwd), "Zephyr launch").length, 1);
	await store.refreshHistory(cwd, { force: true });
	assert.equal(store.listHistory(cwd)[0]?.sessionName, "Zephyr launch");
	assert.deepEqual(store.getIndexState(cwd).warnings, []);
});

test("per-session failures roll back, warn, continue, report progress, and yield", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const sessions = [
		listing(join(root, "bad-one.jsonl"), 100),
		listing(join(root, "good.jsonl"), 100),
		listing(join(root, "bad-two.jsonl"), 100),
		listing(join(root, "bad-three.jsonl"), 100),
	];
	rmSync(sessions[0]!.path);
	let yields = 0;
	const states: Array<ReturnType<PiHistoryStore["getIndexState"]>> = [];
	const store = new PiHistoryStore({
		databasePath: join(root, "db.sqlite"),
		warningLimit: 2,
		listSessions: async (_cwd, onProgress) => {
			onProgress?.(1, 4);
			onProgress?.(4, 4);
			return sessions;
		},
		openSession: (path) => {
			if (path.includes("bad")) throw new Error(`malformed ${path}`);
			return reader([userEntry("good", "surviving prompt", 100)]);
		},
		yieldToEventLoop: async () => {
			yields += 1;
		},
	});
	t.after(() => store.close());
	const unsubscribe = store.subscribe("/repo", (state) => {
		states.push(state);
	});
	t.after(unsubscribe);

	const refresh = store.refreshHistory("/repo", { force: true });
	assert.strictEqual(store.getRefreshPromise("/repo"), refresh);
	await refresh;

	assert.equal(yields, sessions.length);
	assert.deepEqual(
		store.listHistory("/repo").map((item) => item.text),
		["surviving prompt"],
	);
	const final = store.getIndexState("/repo");
	assert.equal(final.active, false);
	assert.equal(final.warnings.length, 2);
	assert.match(final.warnings[0] ?? "", /bad-two/);
	assert.match(final.warnings[1] ?? "", /bad-three/);
	assert.ok(
		states.some((state) =>
			state.warnings.some((warning) => /bad-one.*ENOENT/.test(warning)),
		),
	);
	assert.ok(
		states.some(
			(state) =>
				state.progress?.phase === "sessions" &&
				state.progress.loaded === 4 &&
				state.progress.total === 4,
		),
	);
	assert.ok(
		states.some(
			(state) =>
				state.progress?.phase === "prompts" &&
				state.progress.loaded === sessions.length,
		),
	);
});

test("a session disappearing between stat and SDK open preserves cached rows and isolates the failure", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const cwd = "/repo";
	const sessions = [
		listing(join(root, "vanishing.jsonl"), 100),
		listing(join(root, "good.jsonl"), 100),
	];
	for (const [index, session] of sessions.entries()) {
		writeFileSync(
			session.path,
			[
				{
					type: "session",
					version: 3,
					id: `session-${index}`,
					cwd,
					timestamp: new Date(100).toISOString(),
				},
				userEntry(`prompt-${index}`, `prompt ${index}`, 100),
			]
				.map((entry) => JSON.stringify(entry))
				.join("\n") + "\n",
		);
	}
	const vanishing = sessions[0]!;
	let removeBeforeOpen = false;
	const store = new PiHistoryStore({
		databasePath: join(root, "db.sqlite"),
		listSessions: async () => sessions,
		openSession: (path) => {
			if (removeBeforeOpen && path === vanishing.path) rmSync(path);
			return SessionManager.open(path);
		},
	});
	t.after(() => store.close());
	await store.refreshHistory(cwd);
	assert.equal(store.listHistory(cwd).length, 2);

	removeBeforeOpen = true;
	utimesSync(vanishing.path, new Date(2_000), new Date(2_000));
	const good = sessions[1]!;
	SessionManager.open(good.path).appendMessage({
		role: "user",
		content: "surviving update",
		timestamp: 200,
	});
	utimesSync(good.path, new Date(2_000), new Date(2_000));
	await store.refreshHistory(cwd, { force: true });

	assert.deepEqual(
		store.listHistory(cwd).map((item) => item.text).sort(),
		["prompt 0", "prompt 1", "surviving update"],
	);
	assert.match(store.getIndexState(cwd).warnings.at(-1) ?? "", /vanishing.*ENOENT/);
	assert.equal(store.getIndexState(cwd).active, false);
});

test("failed replacement preserves the previously indexed session rows", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const path = join(root, "db.sqlite");
	let modified = 100;
	let entries = [userEntry("old", "preserved prompt", 100)];
	const store = new PiHistoryStore({
		databasePath: path,
		now: () => modified,
		listSessions: async () => [listing(join(root, "a.jsonl"), modified)],
		openSession: () => reader(entries),
	});
	t.after(() => store.close());
	await store.refreshHistory("/repo", { force: true });

	const external = new DatabaseSync(path);
	external.exec(`
    CREATE TRIGGER block_bad_prompt
    BEFORE INSERT ON history_prompts
    WHEN NEW.text = 'bad replacement'
    BEGIN
      SELECT RAISE(ABORT, 'bad prompt');
    END;
  `);
	external.close();

	modified = 200;
	entries = [userEntry("new", "bad replacement", 200)];
	await store.refreshHistory("/repo", { force: true });
	assert.deepEqual(
		store.listHistory("/repo").map((item) => item.text),
		["preserved prompt"],
	);
	assert.match(
		store.getIndexState("/repo").warnings.at(-1) ?? "",
		/bad prompt/,
	);
});

test("close waits for active refreshes before closing SQLite", async (t) => {
	const root = temporaryDirectory();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	let release: (() => void) | undefined;
	const listed = new Promise<SessionListing[]>((resolve) => {
		release = () => resolve([]);
	});
	const store = new PiHistoryStore({
		databasePath: join(root, "db.sqlite"),
		listSessions: async () => listed,
	});

	const refresh = store.refreshHistory("/repo", { force: true });
	let closed = false;
	const closing = store.close().then(() => {
		closed = true;
	});
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(closed, false);
	assert.equal(store.isOpen(), true);

	release?.();
	await refresh;
	await closing;
	assert.equal(closed, true);
	assert.equal(store.isOpen(), false);
});
