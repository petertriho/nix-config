import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildCapturePaneArgs,
	buildSendKeysArgs,
	buildSplitWindowArgs,
	buildLaunchScript,
	closeSurface,
	createSurface,
	interpretExitSidecar,
	paneExists,
	parsePaneId,
	pollForExit,
	shellEscape,
} from "./tmux.ts";

test("shellEscape wraps plain text in single quotes", () => {
	assert.equal(shellEscape("hello"), "'hello'");
});

test("shellEscape escapes embedded single quotes", () => {
	assert.equal(shellEscape("it's"), "'it'\\''s'");
});

test("shellEscape handles the empty string", () => {
	assert.equal(shellEscape(""), "''");
});

test("interpretExitSidecar decodes a ping payload", () => {
	assert.deepEqual(
		interpretExitSidecar({ type: "ping", name: "Worker", message: "need help" }),
		{ reason: "ping", exitCode: 0, ping: { name: "Worker", message: "need help" } },
	);
});

test("interpretExitSidecar decodes an error payload with a message", () => {
	assert.deepEqual(
		interpretExitSidecar({ type: "error", errorMessage: "overloaded" }),
		{ reason: "error", exitCode: 1, errorMessage: "overloaded" },
	);
});

test("interpretExitSidecar fills a default message for an empty error", () => {
	const result = interpretExitSidecar({ type: "error" });
	assert.equal(result.reason, "error");
	assert.equal(result.exitCode, 1);
	assert.match(result.errorMessage ?? "", /stopReason=error/);
});

test("interpretExitSidecar treats done, empty, and null payloads as done", () => {
	assert.deepEqual(interpretExitSidecar({ type: "done" }), { reason: "done", exitCode: 0 });
	assert.deepEqual(interpretExitSidecar({}), { reason: "done", exitCode: 0 });
	assert.deepEqual(interpretExitSidecar(null), { reason: "done", exitCode: 0 });
});

test("buildSplitWindowArgs targets the parent pane and prints the pane id", () => {
	assert.deepEqual(buildSplitWindowArgs("%3"), [
		"split-window",
		"-d",
		"-h",
		"-t",
		"%3",
		"-P",
		"-F",
		"#{pane_id}",
	]);
});

test("buildSplitWindowArgs omits the target when no parent pane is known", () => {
	assert.deepEqual(buildSplitWindowArgs(undefined), [
		"split-window",
		"-d",
		"-h",
		"-P",
		"-F",
		"#{pane_id}",
	]);
});

test("parsePaneId accepts a tmux pane id and rejects other output", () => {
	assert.equal(parsePaneId("%12\n"), "%12");
	assert.throws(() => parsePaneId("can't find pane"), /Unexpected tmux split-window output/);
});

test("buildCapturePaneArgs reads the last N lines and clamps to at least one", () => {
	assert.deepEqual(buildCapturePaneArgs("%5", 50), ["capture-pane", "-p", "-t", "%5", "-S", "-50"]);
	assert.deepEqual(buildCapturePaneArgs("%5", 0), ["capture-pane", "-p", "-t", "%5", "-S", "-1"]);
});

test("buildSendKeysArgs sends literal text and named keys", () => {
	assert.deepEqual(buildSendKeysArgs("%5", "echo hi", { literal: true }), [
		"send-keys",
		"-t",
		"%5",
		"-l",
		"echo hi",
	]);
	assert.deepEqual(buildSendKeysArgs("%5", "Enter", { literal: false }), [
		"send-keys",
		"-t",
		"%5",
		"Enter",
	]);
});

test("pollForExit returns the sidecar payload and removes the file without touching tmux", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-test-"));
	try {
		const sessionFile = join(dir, "session.jsonl");
		writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "ping", name: "A", message: "hi" }));
		const result = await pollForExit("%999", new AbortController().signal, {
			interval: 10,
			sessionFile,
		});
		assert.deepEqual(result, { reason: "ping", exitCode: 0, ping: { name: "A", message: "hi" } });
		assert.equal(existsSync(`${sessionFile}.exit`), false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pollForExit rejects when the signal is already aborted", async () => {
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		pollForExit("%999", controller.signal, { interval: 10 }),
		/Aborted/,
	);
});

test("buildLaunchScript comments out every preamble line so a newline in a name cannot inject a command", () => {
	const preamble = ["# Subagent launch script for Evil", "rm -rf ~", "# Surface: %1"].join("\n");
	const script = buildLaunchScript("bash '/tmp/real-cmd.sh'", preamble);
	const lines = script.trimEnd().split("\n");
	assert.equal(lines[0], "#!/bin/bash");
	// Every preamble line is a comment; the injected rm line is neutralized.
	for (const line of lines.slice(1, -1)) {
		assert.match(line, /^#/, `preamble line not commented: ${line}`);
	}
	assert.equal(lines.includes("rm -rf ~"), false);
	assert.ok(lines.some((line) => line === "# rm -rf ~"));
	// The real command stays the last line, verbatim.
	assert.equal(lines[lines.length - 1], "bash '/tmp/real-cmd.sh'");
});

test("interpretExitSidecar decodes a turn-limit payload", () => {
	assert.deepEqual(
		interpretExitSidecar({
			type: "turn-limit",
			errorMessage: "Task agent exceeded its turn limit (3 turns plus 5 grace turns) and was aborted without a final answer.",
			maxTurns: 3,
			graceTurns: 5,
		}),
		{
			reason: "turn-limit",
			exitCode: 1,
			errorMessage: "Task agent exceeded its turn limit (3 turns plus 5 grace turns) and was aborted without a final answer.",
		},
	);
	// A malformed turn-limit payload still surfaces a clear failure.
	assert.deepEqual(interpretExitSidecar({ type: "turn-limit" }), {
		reason: "turn-limit",
		exitCode: 1,
		errorMessage: "Subagent exceeded its turn limit and was aborted.",
	});
});

test(
	"a vanished pane settles pollForExit terminally instead of polling forever",
	{ skip: !process.env.TMUX && "TMUX is not set", timeout: 15_000 },
	async () => {
		// A pane id that cannot exist: capture fails, no sidecar, and the pane
		// is genuinely absent from the server.
		const result = await pollForExit("%999999", AbortSignal.timeout(10_000), {
			interval: 50,
		});
		assert.equal(result.reason, "error");
		assert.equal(result.exitCode, 1);
		assert.match(result.errorMessage ?? "", /disappeared before exiting/);
	},
);

test(
	"paneExists distinguishes a live pane from a removed one",
	{ skip: !process.env.TMUX && "TMUX is not set", timeout: 15_000 },
	async () => {
		const pane = createSurface("it-pane-exists");
		try {
			assert.equal(paneExists(pane), true);
			closeSurface(pane);
			assert.equal(paneExists(pane), false);
		} finally {
			try {
				closeSurface(pane);
			} catch {
				// Already closed above.
			}
		}
		assert.equal(paneExists("%999999"), false);
	},
);
