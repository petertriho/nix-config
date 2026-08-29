import { randomBytes } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Central per-agent default-model config: a flat
 * `{ "agent-name": "provider/model[:thinking]" }` map at
 * `<agentDir>/agent-models.json`, managed by the `/agent-models` command.
 *
 * Values use the exact `provider/model[:thinking]` string syntax of the
 * `subagent` tool's `model:` parameter and are resolved through the
 * validated registry path at spawn time. Entries never affect `/workflow`
 * phase roles and never apply to `cli:` agents (those keep frontmatter).
 */
export const AGENT_MODELS_VERSION = 1 as const;

export interface AgentModelConfig {
	version: typeof AGENT_MODELS_VERSION;
	agents: Record<string, string>;
}

export type AgentModelConfigReadResult =
	| { status: "ok"; config: AgentModelConfig; path: string }
	| { status: "missing"; path: string }
	| { status: "invalid"; error: string; path: string };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
	value: UnknownRecord,
	required: readonly string[],
	optional: readonly string[] = [],
): boolean {
	const allowed = new Set([...required, ...optional]);
	return required.every((key) => Object.hasOwn(value, key))
		&& Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isAgentsMap(value: unknown): value is Record<string, string> {
	if (!isRecord(value)) return false;
	return Object.entries(value).every(([key, entry]) => isNonEmptyString(key) && isNonEmptyString(entry));
}

export function validateAgentModelConfig(value: unknown): value is AgentModelConfig {
	if (!isRecord(value) || !hasExactKeys(value, ["version", "agents"])) return false;
	return value.version === AGENT_MODELS_VERSION && isAgentsMap(value.agents);
}

export function agentModelsPath(agentDir = getAgentDir()): string {
	return join(agentDir, "agent-models.json");
}

export function readAgentModelConfig(agentDir = getAgentDir()): AgentModelConfigReadResult {
	const path = agentModelsPath(agentDir);
	if (!existsSync(path)) return { status: "missing", path };

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		return {
			status: "invalid",
			path,
			error: `Malformed agent model config ${path}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	if (!isRecord(parsed) || parsed.version !== AGENT_MODELS_VERSION) {
		return {
			status: "invalid",
			path,
			error: `Unsupported agent model config version ${String(isRecord(parsed) ? parsed.version : undefined)} in ${path}`,
		};
	}
	if (!validateAgentModelConfig(parsed)) {
		return { status: "invalid", path, error: `Invalid agent model config schema in ${path}` };
	}
	return { status: "ok", config: parsed, path };
}

export function writeAgentModelConfig(config: AgentModelConfig, agentDir = getAgentDir()): string {
	if (!validateAgentModelConfig(config)) {
		throw new Error("Refusing to serialize an invalid agent model config");
	}

	const path = agentModelsPath(agentDir);
	const parent = dirname(path);
	mkdirSync(parent, { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
	try {
		writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
			flag: "wx",
		});
		chmodSync(temporaryPath, 0o600);
		renameSync(temporaryPath, path);
		chmodSync(path, 0o600);
	} finally {
		rmSync(temporaryPath, { force: true });
	}
	return path;
}
