import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { __test__ } from "../index.ts";
import subagentDone, { parseMaxTurnsEnv } from "../subagent-done.ts";
import childSubagentDone, { parseMaxTurnsEnv as childParseMaxTurnsEnv } from "../child/subagent-done.ts";
import teamMember from "../team-member.ts";
import childTeamMember from "../child/team-member.ts";
import { attachTmuxWorkflowProvider } from "../workflow-provider.ts";
import { attachTmuxWorkflowProvider as adapterAttachTmuxWorkflowProvider } from "../adapters/workflow-provider.ts";
import { resolveTaskAgentProfile, resolveTaskLaunchModel, TaskRunStore } from "../tasks/rpc.ts";
import { resolveTaskAgentProfile as profileResolveTaskAgentProfile } from "../tasks/profiles.ts";
import { resolveTaskLaunchModel as modelResolveTaskLaunchModel } from "../tasks/models.ts";
import { TaskRunStore as storeTaskRunStore } from "../tasks/store.ts";
import {
	buildPiPromptArgs,
	createSubagentExecutionServices,
	getShellReadyDelayMs,
	parseLegacyModelSelection,
	resolveUsageDetails,
} from "../subagent-services.ts";
import { createSubagentExecutionServices as createGroupedExecutionServices } from "../execution/composition.ts";

test("compatibility entry files directly export the grouped implementations", () => {
	assert.strictEqual(subagentDone, childSubagentDone);
	assert.strictEqual(parseMaxTurnsEnv, childParseMaxTurnsEnv);
	assert.strictEqual(teamMember, childTeamMember);
	assert.strictEqual(attachTmuxWorkflowProvider, adapterAttachTmuxWorkflowProvider);
	assert.strictEqual(createSubagentExecutionServices, createGroupedExecutionServices);
	assert.strictEqual(resolveTaskAgentProfile, profileResolveTaskAgentProfile);
	assert.strictEqual(resolveTaskLaunchModel, modelResolveTaskLaunchModel);
	assert.strictEqual(TaskRunStore, storeTaskRunStore);
});

test("registration and execution share prompt, delay, model, and usage helpers", () => {
	assert.strictEqual(__test__.buildPiPromptArgs, buildPiPromptArgs);
	assert.strictEqual(__test__.getShellReadyDelayMs, getShellReadyDelayMs);
	assert.strictEqual(__test__.parseLegacyModelSelection, parseLegacyModelSelection);
	assert.strictEqual(__test__.resolveUsageDetails, resolveUsageDetails);
});

test("a fresh entry module clears old timers and owns fresh runtime state", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const widgetKey = Symbol.for("pi-agent-teams/widget-interval");
	const statusKey = Symbol.for("pi-agent-teams/status-interval");
	const abortKey = Symbol.for("pi-agent-teams/poll-abort-controller");
	const previousAbort = Reflect.get(globalThis, abortKey);
	assert.ok(previousAbort instanceof AbortController);
	let ticks = 0;
	const widgetTimer = setInterval(() => ticks++, 1_000);
	const statusTimer = setInterval(() => ticks++, 1_000);
	Reflect.set(globalThis, widgetKey, widgetTimer);
	Reflect.set(globalThis, statusKey, statusTimer);
	try {
		const entry = new URL("../index.ts", import.meta.url);
		entry.searchParams.set("layout-reload", String(Date.now()));
		const reloaded = await import(entry.href);
		assert.notStrictEqual(reloaded.__test__.runningSubagents, __test__.runningSubagents);
		assert.equal(previousAbort.signal.aborted, true);
		const nextAbort = Reflect.get(globalThis, abortKey);
		assert.ok(nextAbort instanceof AbortController);
		assert.notStrictEqual(nextAbort, previousAbort);
		assert.equal(nextAbort.signal.aborted, false);
		assert.equal(Reflect.get(globalThis, widgetKey), null);
		assert.equal(Reflect.get(globalThis, statusKey), null);
		t.mock.timers.tick(1_000);
		assert.equal(ticks, 0);
	} finally {
		clearInterval(widgetTimer);
		clearInterval(statusTimer);
	}
});

test("bundled agent discovery stays anchored at the extension root", () => {
	assert.equal(
		__test__.getBundledAgentsDir(),
		fileURLToPath(new URL("../agents", import.meta.url)),
	);
});

test("grouped status configuration reads the extension root and reports its example path", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-subagents-layout-"));
	const telemetry = join(root, "telemetry");
	mkdirSync(telemetry);
	const modulePath = join(telemetry, "status.ts");
	copyFileSync(new URL("../telemetry/status.ts", import.meta.url), modulePath);
	const configPath = join(root, "config.json");
	try {
		writeFileSync(configPath, JSON.stringify({ status: { enabled: false } }));
		const { loadStatusConfig } = await import(pathToFileURL(modulePath).href);
		assert.deepEqual(loadStatusConfig(), { enabled: false, lineLimit: 4 });

		writeFileSync(configPath, "{");
		assert.throws(() => loadStatusConfig(), (error: unknown) => {
			assert.ok(error instanceof Error);
			assert.ok(error.message.includes(configPath));
			assert.ok(error.message.includes(join(root, "config.json.example")));
			assert.ok(!error.message.includes(join(telemetry, "config.json")));
			return true;
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
