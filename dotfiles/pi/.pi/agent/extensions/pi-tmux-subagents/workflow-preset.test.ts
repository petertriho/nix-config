import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import {
	canonicalProjectRoot,
	editWorkflowPresetRoles,
	makeWorkflowModelPreset,
	readWorkflowModelPreset,
	validateWorkflowModelPreset,
	validateWorkflowPresetRoles,
	workflowPresetKey,
	workflowPresetPath,
	writeWorkflowModelPreset,
	type WorkflowPresetRoles,
} from "./workflow-preset.ts";

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-workflow-preset-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const roles: WorkflowPresetRoles = {
	planner: { provider: "anthropic", model: "claude", thinking: "high" },
	taskWriter: { provider: "openai", model: "gpt", thinking: "medium" },
	implementer: { provider: "anthropic", model: "claude", thinking: "xhigh" },
	reviewer: { provider: "local", model: "plain", thinking: "off" },
};

function model(provider: string, id: string, reasoning = true): Model<any> {
	return {
		provider,
		id,
		name: id,
		api: "openai-responses",
		baseUrl: "https://example.test",
		reasoning,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_000,
		thinkingLevelMap: reasoning ? { xhigh: "xhigh" } : undefined,
	};
}

test("workflow preset keys use Git top-level roots and isolate repositories", () => {
	withTempDir((dir) => {
		const a = join(dir, "a");
		const b = join(dir, "b");
		const nested = join(a, "src", "deep");
		mkdirSync(nested, { recursive: true });
		mkdirSync(b);
		execFileSync("git", ["init"], { cwd: a, stdio: "ignore" });
		execFileSync("git", ["init"], { cwd: b, stdio: "ignore" });
		assert.equal(canonicalProjectRoot(nested), canonicalProjectRoot(a));
		assert.equal(workflowPresetKey(nested), workflowPresetKey(a));
		assert.notEqual(workflowPresetKey(a), workflowPresetKey(b));
	});
});

test("canonical project roots fall back to canonical cwd outside Git", () => {
	withTempDir((dir) => {
		const a = join(dir, "a");
		const b = join(dir, "b");
		mkdirSync(a);
		mkdirSync(b);
		assert.equal(canonicalProjectRoot(join(a, ".")), canonicalProjectRoot(a));
		assert.equal(workflowPresetKey(join(a, ".")), workflowPresetKey(a));
		assert.notEqual(workflowPresetKey(a), workflowPresetKey(b));
	});
});

test("workflow presets round trip atomically with restrictive permissions", () => {
	withTempDir((dir) => {
		const project = join(dir, "project");
		const agentDir = join(dir, "agent");
		mkdirSync(project);
		const preset = makeWorkflowModelPreset(project, roles, new Date("2026-08-27T12:00:00Z"));
		const path = writeWorkflowModelPreset(preset, agentDir);
		assert.equal(path, workflowPresetPath(project, agentDir));
		assert.equal(statSync(path).mode & 0o777, 0o600);
		assert.deepEqual(readWorkflowModelPreset(project, agentDir), {
			status: "ok",
			preset,
			path,
		});

		const updated = makeWorkflowModelPreset(
			project,
			editWorkflowPresetRoles(roles, {
				reviewer: { provider: "openai", model: "gpt", thinking: "high" },
			}),
			new Date("2026-08-27T13:00:00Z"),
		);
		writeWorkflowModelPreset(updated, agentDir);
		assert.deepEqual(readWorkflowModelPreset(project, agentDir), {
			status: "ok",
			preset: updated,
			path,
		});
	});
});

test("workflow preset validation rejects malformed, unsupported, and secret data", () => {
	withTempDir((dir) => {
		const project = join(dir, "project");
		const agentDir = join(dir, "agent");
		mkdirSync(project);
		const path = workflowPresetPath(project, agentDir);
		mkdirSync(dirname(path), { recursive: true });

		writeFileSync(path, JSON.stringify({ version: 99 }));
		assert.equal(readWorkflowModelPreset(project, agentDir).status, "invalid");

		const invalid = { ...makeWorkflowModelPreset(project, roles), token: "secret" };
		assert.equal(validateWorkflowModelPreset(invalid), false);
		assert.throws(
			() => writeWorkflowModelPreset(invalid as any, agentDir),
			/Refusing to serialize/,
		);
	});
});

test("selective role editing preserves untouched assignments", () => {
	const edited = editWorkflowPresetRoles(roles, {
		taskWriter: { provider: "openai", model: "gpt-2", thinking: "low" },
	});
	assert.deepEqual(edited.planner, roles.planner);
	assert.deepEqual(edited.implementer, roles.implementer);
	assert.deepEqual(edited.reviewer, roles.reviewer);
	assert.deepEqual(edited.taskWriter, {
		provider: "openai",
		model: "gpt-2",
		thinking: "low",
	});
});

test("workflow assignments validate all roles and retain stale entries for correction", () => {
	const available = [
		model("anthropic", "claude"),
		model("openai", "gpt"),
		model("local", "plain", false),
	];
	assert.deepEqual(validateWorkflowPresetRoles(roles, available), []);
	const stale = editWorkflowPresetRoles(roles, {
		reviewer: { provider: "missing", model: "gone", thinking: "high" },
	});
	const errors = validateWorkflowPresetRoles(stale, available);
	assert.equal(errors.length, 1);
	assert.match(errors[0], /^reviewer: Model "missing\/gone:high"/);
	assert.deepEqual(stale.reviewer, {
		provider: "missing",
		model: "gone",
		thinking: "high",
	});
});
