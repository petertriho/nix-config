import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubagentActivityRecorder,
	getSubagentActivityFile,
	readSubagentActivityFile,
} from "./activity.ts";

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-activity-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function validActivity(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		runningChildId: "child-1",
		createdAt: 1_000,
		updatedAt: 1_000,
		sequence: 1,
		latestEvent: "session_start",
		phase: "starting",
		agentActive: false,
		turnActive: false,
		providerActive: false,
		toolActive: false,
		...overrides,
	};
}

test("activity file is missing before the recorder writes", () => {
	withTempDir((dir) => {
		const activityFile = getSubagentActivityFile(dir, "child-0");
		assert.deepEqual(readSubagentActivityFile(activityFile, "child-0"), { ok: false, reason: "missing" });
	});
});

test("recorder writes activity files validated by running child id", () => {
	withTempDir((dir) => {
		const activityFile = getSubagentActivityFile(dir, "child-1");
		const recorder = createSubagentActivityRecorder({ runningChildId: "child-1", activityFile, now: () => 1_000 });
		recorder.sessionStart();
		recorder.toolExecutionStart("tool-1", "bash");

		const read = readSubagentActivityFile(activityFile, "child-1");
		assert.ok(read.ok);
		assert.equal(read.activity.phase, "active");
		assert.equal(read.activity.activeScope, "tool");
		assert.equal(read.activity.toolName, "bash");
		assert.deepEqual(readSubagentActivityFile(activityFile, "other-child"), { ok: false, reason: "wrong-id" });
	});
});

test("recorder records waiting and final done states", () => {
	withTempDir((dir) => {
		let currentNow = 2_000;
		const activityFile = getSubagentActivityFile(dir, "child-2");
		const recorder = createSubagentActivityRecorder({ runningChildId: "child-2", activityFile, now: () => currentNow });
		recorder.sessionStart();
		currentNow = 3_000;
		recorder.agentEndWaiting();
		let read = readSubagentActivityFile(activityFile, "child-2");
		assert.ok(read.ok);
		assert.equal(read.activity.phase, "waiting");
		assert.equal(read.activity.waitingSince, 3_000);

		currentNow = 4_000;
		recorder.subagentDone();
		read = readSubagentActivityFile(activityFile, "child-2");
		assert.ok(read.ok);
		assert.equal(read.activity.phase, "done");
		assert.equal(read.activity.agentActive, false);
	});
});

test("invalid JSON and malformed fields are reported as invalid", () => {
	withTempDir((dir) => {
		mkdirSync(join(dir, "subagent-activity"), { recursive: true });
		const broken = getSubagentActivityFile(dir, "broken");
		writeFileSync(broken, "{\n");
		const brokenRead = readSubagentActivityFile(broken, "broken");
		assert.equal(brokenRead.ok, false);
		assert.equal((brokenRead as { reason: string }).reason, "invalid");

		const cases = [
			{ activeSince: "bad" },
			{ waitingSince: "bad" },
			{ activeScope: "database" },
			{ latestEvent: "unknown" },
			{ runningChildId: 42 },
			{ toolActive: "yes" },
			{ toolName: "bad\nname" },
		];
		for (const [index, overrides] of cases.entries()) {
			const activityFile = getSubagentActivityFile(dir, `child-${index}`);
			writeFileSync(activityFile, `${JSON.stringify(validActivity({ runningChildId: `child-${index}`, ...overrides }))}\n`);
			const read = readSubagentActivityFile(activityFile, `child-${index}`);
			assert.equal(read.ok, false);
			assert.equal((read as { ok: false; reason: string }).reason, "invalid");
		}
	});
});

test("tool_result does not resurrect finished tool activity", () => {
	withTempDir((dir) => {
		let currentNow = 1_000;
		const activityFile = getSubagentActivityFile(dir, "child-3");
		const recorder = createSubagentActivityRecorder({ runningChildId: "child-3", activityFile, now: () => currentNow });
		recorder.sessionStart();
		recorder.agentStart();
		recorder.turnStart(1);
		currentNow = 2_000;
		recorder.toolExecutionStart("tool-1", "bash");
		currentNow = 3_000;
		recorder.toolExecutionEnd("tool-1", "bash");
		currentNow = 4_000;
		recorder.toolResult("tool-1", "bash");

		const read = readSubagentActivityFile(activityFile, "child-3");
		assert.ok(read.ok);
		assert.equal(read.activity.toolActive, false);
		assert.equal(read.activity.activeScope, "turn");
	});
});

test("reload shutdown is not recorded as the final done snapshot", () => {
	withTempDir((dir) => {
		const activityFile = getSubagentActivityFile(dir, "child-4");
		const recorder = createSubagentActivityRecorder({ runningChildId: "child-4", activityFile, now: () => 1_000 });
		recorder.sessionStart();
		recorder.sessionShutdown("reload");
		const read = readSubagentActivityFile(activityFile, "child-4");
		assert.ok(read.ok);
		assert.equal(read.activity.phase, "starting");
		assert.equal(read.activity.latestEvent, "session_start");
	});
});

test("pending throttled writes are cancelled on reload shutdown", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-activity-"));
	try {
		let currentNow = 1_000;
		const activityFile = getSubagentActivityFile(dir, "child-5");
		const recorder = createSubagentActivityRecorder({ runningChildId: "child-5", activityFile, now: () => currentNow });
		recorder.sessionStart();
		currentNow = 1_100;
		recorder.messageUpdate("delta");
		recorder.sessionShutdown("reload");
		await new Promise((resolve) => setTimeout(resolve, 650));
		const read = readSubagentActivityFile(activityFile, "child-5");
		assert.ok(read.ok);
		assert.equal(read.activity.phase, "starting");
		assert.equal(read.activity.latestEvent, "session_start");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("recorder without an id or file is a no-op", () => {
	withTempDir((dir) => {
		const activityFile = getSubagentActivityFile(dir, "child-6");
		const recorder = createSubagentActivityRecorder({ runningChildId: "", activityFile });
		recorder.sessionStart();
		assert.deepEqual(readSubagentActivityFile(activityFile, "child-6"), { ok: false, reason: "missing" });
	});
});
