import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	AGENT_MODELS_VERSION,
	agentModelsPath,
	readAgentModelConfig,
	validateAgentModelConfig,
	writeAgentModelConfig,
} from "./agent-models.ts";

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-agent-models-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("agent model config schema accepts only version-1 flat maps of non-empty strings", () => {
	assert.equal(validateAgentModelConfig({ version: 1, agents: {} }), true);
	assert.equal(
		validateAgentModelConfig({ version: 1, agents: { scout: "anthropic/claude-opus-4-5:high" } }),
		true,
	);
	const rejected: unknown[] = [
		{ version: 2, agents: {} },
		{ version: 1 },
		{ version: 1, agents: {}, extra: true },
		{ version: 1, agents: { scout: "" } },
		{ version: 1, agents: { "": "anthropic/claude" } },
		{ version: 1, agents: { scout: 7 } },
		{ version: 1, agents: ["anthropic/claude"] },
		{ version: "1", agents: {} },
		{ agents: {} },
		null,
		"config",
	];
	for (const bad of rejected) {
		assert.equal(validateAgentModelConfig(bad), false, JSON.stringify(bad));
	}
});

test("agent model config round trips through the agent dir", () => {
	withTempDir((dir) => {
		const config = {
			version: AGENT_MODELS_VERSION,
			agents: { scout: "anthropic/claude:high", worker: "openai/gpt" },
		};
		const path = writeAgentModelConfig(config, dir);
		assert.equal(path, agentModelsPath(dir));
		assert.deepEqual(readAgentModelConfig(dir), { status: "ok", config, path });

		const cleared = { version: AGENT_MODELS_VERSION, agents: {} };
		writeAgentModelConfig(cleared, dir);
		assert.deepEqual(readAgentModelConfig(dir), { status: "ok", config: cleared, path });
	});
});

test("missing config files read as missing; malformed and invalid files report errors", () => {
	withTempDir((dir) => {
		const path = agentModelsPath(dir);
		assert.deepEqual(readAgentModelConfig(dir), { status: "missing", path });

		writeFileSync(path, "{not json");
		const malformed = readAgentModelConfig(dir);
		assert.equal(malformed.status, "invalid");
		assert.ok(malformed.status === "invalid" && malformed.error.includes(path));
		assert.ok(malformed.status === "invalid" && /Malformed agent model config/.test(malformed.error));

		writeFileSync(path, JSON.stringify({ version: 99, agents: {} }));
		const versioned = readAgentModelConfig(dir);
		assert.equal(versioned.status, "invalid");
		assert.ok(versioned.status === "invalid" && /Unsupported agent model config version 99/.test(versioned.error));

		writeFileSync(path, JSON.stringify({ version: 1, agents: { scout: "" } }));
		const schema = readAgentModelConfig(dir);
		assert.equal(schema.status, "invalid");
		assert.ok(schema.status === "invalid" && /Invalid agent model config schema/.test(schema.error));
	});
});

test("agent model config writes are atomic, restrictive, and refuse invalid data", () => {
	withTempDir((dir) => {
		const path = writeAgentModelConfig(
			{ version: AGENT_MODELS_VERSION, agents: { scout: "anthropic/claude" } },
			dir,
		);
		assert.equal(statSync(path).mode & 0o777, 0o600);
		assert.deepEqual(
			readdirSync(dir).filter((entry) => entry.includes(".tmp-")),
			[],
			"no temporary files may survive the rename",
		);

		writeAgentModelConfig({ version: AGENT_MODELS_VERSION, agents: {} }, dir);
		assert.equal(statSync(path).mode & 0o777, 0o600);
		assert.deepEqual(readAgentModelConfig(dir).status, "ok");

		assert.throws(
			() => writeAgentModelConfig({ version: AGENT_MODELS_VERSION, agents: { scout: "" } } as never, dir),
			/Refusing to serialize/,
		);

		const nested = join(dir, "deep", "agent");
		mkdirSync(nested, { recursive: true });
		assert.equal(
			writeAgentModelConfig({ version: AGENT_MODELS_VERSION, agents: {} }, nested),
			agentModelsPath(nested),
		);
	});
});
