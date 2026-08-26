import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	advanceStatusState,
	capStatusLines,
	classifyStatus,
	createStatusState,
	forceStatusAfterInterrupt,
	formatStatusAggregate,
	formatStatusLine,
	formatTransitionLine,
	loadStatusConfig,
	observeStatus,
	parseStatusConfig,
} from "./status.ts";

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-status-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("parseStatusConfig accepts the strict shape", () => {
	assert.deepEqual(parseStatusConfig({ status: { enabled: false } }), { enabled: false, lineLimit: 4 });
});

test("parseStatusConfig rejects wrong types and unknown keys", () => {
	assert.throws(() => parseStatusConfig({ status: { enabled: "false" } }), /status\.enabled must be a boolean/);
	assert.throws(
		() => parseStatusConfig({ status: { enabled: true, defaultCadenceSeconds: 60 } }),
		/status has unsupported key\(s\): defaultCadenceSeconds/,
	);
});

test("loadStatusConfig reads the bundled config.json.example", () => {
	const examplePath = fileURLToPath(new URL("./config.json.example", import.meta.url));
	assert.deepEqual(loadStatusConfig(examplePath), { enabled: true, lineLimit: 4 });
});

test("loadStatusConfig returns the default when config.json is absent", () => {
	withTempDir((dir) => {
		assert.deepEqual(loadStatusConfig(join(dir, "config.json"), join(dir, "config.json.example")), {
			enabled: true,
			lineLimit: 4,
		});
	});
});

test("loadStatusConfig fails on invalid JSON and invalid shapes with the example hint", () => {
	withTempDir((dir) => {
		const configPath = join(dir, "config.json");
		const examplePath = join(dir, "config.json.example");
		writeFileSync(configPath, "{\n");
		assert.throws(
			() => loadStatusConfig(configPath, examplePath),
			/Invalid JSON in subagent config .*config\.json.*config\.json\.example/,
		);
		writeFileSync(configPath, JSON.stringify({ status: { enabled: true, extra: 1 } }));
		assert.throws(
			() => loadStatusConfig(configPath, examplePath),
			/unsupported key\(s\): extra.*config\.json\.example/,
		);
	});
});

test("missing snapshot stays starting until the watchdog threshold", () => {
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	state = observeStatus(state, { snapshot: "missing" }, 1_000);
	assert.equal(classifyStatus(state, 60_999).kind, "starting");
	const stalled = classifyStatus(state, 61_000);
	assert.equal(stalled.kind, "stalled");
	assert.equal(stalled.statusLabel, null);
});

test("active snapshots do not age into stalled", () => {
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	state = observeStatus(state, {
		snapshot: "present",
		updatedAt: 5_000,
		sequence: 1,
		phase: "active",
		active: true,
		activeScope: "tool",
		activeSince: 5_000,
		activityLabel: "bash",
		latestEvent: "tool_execution_start",
	}, 5_000);
	const snapshot = classifyStatus(state, 240_000);
	assert.equal(snapshot.kind, "active");
	assert.equal(snapshot.activityLabel, "bash");
	assert.equal(snapshot.activeDurationText, "3m");
});

test("waiting snapshots are healthy idle", () => {
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	state = observeStatus(state, {
		snapshot: "present",
		updatedAt: 10_000,
		sequence: 1,
		phase: "waiting",
		waitingSince: 10_000,
		latestEvent: "agent_end",
	}, 10_000);
	const snapshot = classifyStatus(state, 240_000);
	assert.equal(snapshot.kind, "waiting");
	assert.equal(snapshot.waitingDurationText, "3m");
});

test("claude-backed subagents use the elapsed-only fallback", () => {
	const state = createStatusState({ source: "claude", startTimeMs: 0 });
	const snapshot = classifyStatus(state, 125_000);
	assert.equal(snapshot.kind, "running");
	assert.equal(snapshot.elapsedText, "2m");
});

test("advanceStatusState detects stalled transitions and recovery", () => {
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	state = observeStatus(state, { snapshot: "missing" }, 1_000);
	let advanced = advanceStatusState(state, 95_000);
	assert.equal(advanced.transition, "stalled");
	assert.equal(advanced.snapshot.kind, "stalled");

	state = observeStatus(advanced.nextState, {
		snapshot: "present",
		updatedAt: 96_000,
		sequence: 1,
		phase: "waiting",
		waitingSince: 96_000,
		latestEvent: "agent_end",
	}, 96_000);
	advanced = advanceStatusState(state, 97_000);
	assert.equal(advanced.transition, "recovered");
	assert.equal(advanced.snapshot.kind, "waiting");
});

test("transient snapshot loss keeps the last healthy kind", () => {
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	state = observeStatus(state, {
		snapshot: "present",
		updatedAt: 5_000,
		sequence: 1,
		phase: "active",
		active: true,
		activeScope: "streaming",
		activeSince: 5_000,
	}, 5_000);
	state = advanceStatusState(state, 6_000).nextState;
	state = observeStatus(state, { snapshot: "missing" }, 10_000);
	const snapshot = classifyStatus(state, 20_000);
	assert.equal(snapshot.kind, "active");
	assert.equal(snapshot.statusLabel, null);
});

test("forceStatusAfterInterrupt moves an active state to waiting", () => {
	const now = 20_000;
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	state = observeStatus(state, {
		snapshot: "present",
		updatedAt: 5_000,
		sequence: 1,
		phase: "active",
		active: true,
		activeScope: "tool",
		activeSince: 5_000,
		activityLabel: "bash",
	}, 5_000);
	assert.equal(classifyStatus(state, now).kind, "active");
	const forced = forceStatusAfterInterrupt(state, now);
	const snapshot = classifyStatus(forced, now);
	assert.equal(snapshot.kind, "waiting");
	assert.equal(snapshot.activityLabel, "interrupted");
	assert.equal(snapshot.waitingDurationText, "0s");
	assert.equal(forced.activeNow, false);
});

test("same-millisecond snapshots are ordered by sequence", () => {
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	state = observeStatus(state, {
		snapshot: "present",
		updatedAt: 10_000,
		sequence: 2,
		phase: "active",
		active: true,
		activeScope: "tool",
		activeSince: 10_000,
		activityLabel: "bash",
	}, 10_000);
	state = observeStatus(state, {
		snapshot: "present",
		updatedAt: 10_000,
		sequence: 3,
		phase: "waiting",
		waitingSince: 10_000,
		latestEvent: "agent_end",
	}, 10_001);
	const snapshot = classifyStatus(state, 11_000);
	assert.equal(snapshot.kind, "waiting");
	assert.equal(snapshot.latestEvent, "agent_end");
});

test("a repeated valid snapshot recovers from a transient read failure", () => {
	const present = {
		snapshot: "present" as const,
		updatedAt: 5_000,
		sequence: 2,
		phase: "active" as const,
		active: true,
		activeScope: "tool",
		activeSince: 5_000,
		activityLabel: "bash",
	};
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	state = observeStatus(state, present, 5_000);
	state = observeStatus(state, { snapshot: "missing" }, 10_000);
	assert.equal(classifyStatus(state, 10_000).statusLabel, null);
	state = observeStatus(state, present, 11_000);
	const snapshot = classifyStatus(state, 11_000);
	assert.equal(snapshot.kind, "active");
	assert.equal(snapshot.statusLabel, null);
});

test("stale snapshots after interrupt are ignored and newer ones accepted", () => {
	let state = createStatusState({ source: "pi", startTimeMs: 0 });
	const activeAt5 = {
		snapshot: "present" as const,
		updatedAt: 5_000,
		sequence: 1,
		phase: "active" as const,
		active: true,
		activeScope: "tool",
		activeSince: 5_000,
		activityLabel: "bash",
	};
	state = observeStatus(state, activeAt5, 5_000);
	state = forceStatusAfterInterrupt(state, 20_000);

	const stale = observeStatus(state, activeAt5, 21_000);
	let snapshot = classifyStatus(stale, 21_000);
	assert.equal(snapshot.kind, "waiting");
	assert.equal(snapshot.activityLabel, "interrupted");

	const sameTimestamp = observeStatus(stale, { ...activeAt5, updatedAt: 20_000, activeSince: 20_000 }, 22_000);
	snapshot = classifyStatus(sameTimestamp, 22_000);
	assert.equal(snapshot.kind, "waiting");
	assert.equal(snapshot.activityLabel, "interrupted");

	const resumed = observeStatus(sameTimestamp, {
		snapshot: "present",
		sequence: 2,
		updatedAt: 25_000,
		phase: "active",
		active: true,
		activeScope: "streaming",
		activeSince: 25_000,
		activityLabel: "streaming",
	}, 25_000);
	snapshot = classifyStatus(resumed, 25_000);
	assert.equal(snapshot.kind, "active");
	assert.equal(resumed.activeScope, "streaming");
});

test("status lines normalize names and stay within the length bound", () => {
	const longName = `Worker\n\n${"very-long-name-".repeat(12)}`;
	const stalledState = observeStatus(createStatusState({ source: "pi", startTimeMs: 0 }), { snapshot: "missing" }, 1_000);
	const activeState = observeStatus(createStatusState({ source: "pi", startTimeMs: 0 }), {
		snapshot: "present",
		updatedAt: 299_000,
		sequence: 1,
		phase: "active",
		active: true,
		activeScope: "tool",
		activeSince: 299_000,
		activityLabel: "write",
	}, 299_000);
	const line = formatStatusLine(longName, classifyStatus(stalledState, 240_000));
	const recovered = formatTransitionLine(longName, classifyStatus(activeState, 300_000), "recovered");
	assert.doesNotMatch(line, /\n/);
	assert.doesNotMatch(recovered, /\n/);
	assert.ok(line.length <= 120, `expected bounded line length, got ${line.length}`);
	assert.ok(recovered.length <= 120, `expected bounded line length, got ${recovered.length}`);
});

test("capStatusLines and formatStatusAggregate report overflow consistently", () => {
	const waitingState = observeStatus(
		createStatusState({ source: "pi", startTimeMs: 0 }),
		{ snapshot: "present", updatedAt: 180_000, sequence: 1, phase: "waiting", waitingSince: 180_000 },
		180_000,
	);
	const activeState = observeStatus(createStatusState({ source: "pi", startTimeMs: 0 }), {
		snapshot: "present",
		updatedAt: 419_000,
		sequence: 1,
		phase: "active",
		active: true,
		activeScope: "tool",
		activeSince: 419_000,
		activityLabel: "bash",
	}, 419_000);
	const waitingLine = formatStatusLine("Worker", classifyStatus(waitingState, 300_000));
	const recoveredLine = formatTransitionLine("Worker", classifyStatus(activeState, 420_000), "recovered");
	const lines = [waitingLine, recoveredLine, "Scout running 2m.", "Reviewer running 4m.", "Planner running 6m."];
	const capped = capStatusLines(lines, 3);
	const aggregate = formatStatusAggregate(lines, 3);
	assert.equal(waitingLine, "Worker running 5m, waiting 2m.");
	assert.equal(recoveredLine, "Worker running 7m, recovered; active (bash 1s).");
	assert.deepEqual(capped.visibleLines, [waitingLine, recoveredLine, "Scout running 2m."]);
	assert.equal(capped.overflow, 2);
	assert.match(aggregate, /^Subagent status:/);
	assert.match(aggregate, /\+2 more running\./);
	assert.doesNotMatch(aggregate, /\/tmp|\.jsonl/);
});
