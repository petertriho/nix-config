import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	THINKING_LEVELS,
	type SubagentThinkingLevel,
} from "./launch-profile.ts";
import { parseExplicitModelSelection } from "./model-picker.ts";

export const WORKFLOW_PRESET_VERSION = 1 as const;

export const WORKFLOW_ROLE_KEYS = [
	"planner",
	"taskWriter",
	"executor",
	"reviewer",
] as const;

export type WorkflowRoleKey = (typeof WORKFLOW_ROLE_KEYS)[number];

export interface WorkflowRoleSelection {
	provider: string;
	model: string;
	thinking: SubagentThinkingLevel;
}

export type WorkflowPresetRoles = Record<WorkflowRoleKey, WorkflowRoleSelection>;

export interface WorkflowModelPreset {
	version: typeof WORKFLOW_PRESET_VERSION;
	projectRoot: string;
	updatedAt: string;
	roles: WorkflowPresetRoles;
}

export type WorkflowPresetReadResult =
	| { status: "ok"; preset: WorkflowModelPreset; path: string }
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

function isThinking(value: unknown): value is SubagentThinkingLevel {
	return typeof value === "string" && THINKING_LEVELS.includes(value as SubagentThinkingLevel);
}

function isSelection(value: unknown): value is WorkflowRoleSelection {
	if (!isRecord(value) || !hasExactKeys(value, ["provider", "model", "thinking"])) return false;
	return isNonEmptyString(value.provider)
		&& isNonEmptyString(value.model)
		&& isThinking(value.thinking);
}

function isRoles(value: unknown): value is WorkflowPresetRoles {
	if (!isRecord(value) || !hasExactKeys(value, WORKFLOW_ROLE_KEYS)) return false;
	return WORKFLOW_ROLE_KEYS.every((role) => isSelection(value[role]));
}

export function validateWorkflowModelPreset(value: unknown): value is WorkflowModelPreset {
	if (!isRecord(value) || !hasExactKeys(value, ["version", "projectRoot", "updatedAt", "roles"])) {
		return false;
	}
	return value.version === WORKFLOW_PRESET_VERSION
		&& isNonEmptyString(value.projectRoot)
		&& isNonEmptyString(value.updatedAt)
		&& Number.isFinite(Date.parse(value.updatedAt))
		&& isRoles(value.roles);
}

/**
 * Canonical project identity for workflow presets.
 *
 * Git projects use their repository top-level so invoking `/pter` from a
 * nested directory reuses the same preset. Outside Git, the canonicalized cwd
 * is the documented fallback project identity.
 */
export function canonicalProjectRoot(projectRoot: string): string {
	const absolute = resolve(projectRoot);
	const canonicalCwd = existsSync(absolute) ? realpathSync(absolute) : absolute;
	try {
		const gitRoot = execFileSync(
			"git",
			["-C", canonicalCwd, "rev-parse", "--show-toplevel"],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			},
		).trim();
		if (gitRoot) {
			const resolvedRoot = resolve(gitRoot);
			return existsSync(resolvedRoot) ? realpathSync(resolvedRoot) : resolvedRoot;
		}
	} catch {
		// Non-Git directories intentionally fall back to their canonical cwd.
	}
	return canonicalCwd;
}

export function workflowPresetKey(projectRoot: string): string {
	return createHash("sha256").update(canonicalProjectRoot(projectRoot)).digest("hex");
}

export function workflowPresetPath(projectRoot: string, agentDir = getAgentDir()): string {
	return join(
		agentDir,
		"state",
		"pi-tmux-subagents",
		"workflow-presets",
		`${workflowPresetKey(projectRoot)}.json`,
	);
}

export function readWorkflowModelPreset(
	projectRoot: string,
	agentDir = getAgentDir(),
): WorkflowPresetReadResult {
	const canonicalRoot = canonicalProjectRoot(projectRoot);
	const path = workflowPresetPath(canonicalRoot, agentDir);
	if (!existsSync(path)) return { status: "missing", path };

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		return {
			status: "invalid",
			path,
			error: `Malformed workflow model preset ${path}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	if (!isRecord(parsed) || parsed.version !== WORKFLOW_PRESET_VERSION) {
		return {
			status: "invalid",
			path,
			error: `Unsupported workflow model preset version ${String(isRecord(parsed) ? parsed.version : undefined)}`,
		};
	}
	if (!validateWorkflowModelPreset(parsed) || parsed.projectRoot !== canonicalRoot) {
		return {
			status: "invalid",
			path,
			error: `Invalid workflow model preset schema or project root in ${path}`,
		};
	}
	return { status: "ok", preset: parsed, path };
}

export function writeWorkflowModelPreset(
	preset: WorkflowModelPreset,
	agentDir = getAgentDir(),
): string {
	const canonicalRoot = canonicalProjectRoot(preset.projectRoot);
	const normalized: WorkflowModelPreset = { ...preset, projectRoot: canonicalRoot };
	if (!validateWorkflowModelPreset(normalized)) {
		throw new Error("Refusing to serialize an invalid workflow model preset");
	}

	const path = workflowPresetPath(canonicalRoot, agentDir);
	const parent = dirname(path);
	mkdirSync(parent, { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
	try {
		writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, {
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

export function makeWorkflowModelPreset(
	projectRoot: string,
	roles: WorkflowPresetRoles,
	now = new Date(),
): WorkflowModelPreset {
	return {
		version: WORKFLOW_PRESET_VERSION,
		projectRoot: canonicalProjectRoot(projectRoot),
		updatedAt: now.toISOString(),
		roles: structuredClone(roles),
	};
}

export function editWorkflowPresetRoles(
	roles: WorkflowPresetRoles,
	updates: Partial<WorkflowPresetRoles>,
): WorkflowPresetRoles {
	return {
		planner: structuredClone(updates.planner ?? roles.planner),
		taskWriter: structuredClone(updates.taskWriter ?? roles.taskWriter),
		executor: structuredClone(updates.executor ?? roles.executor),
		reviewer: structuredClone(updates.reviewer ?? roles.reviewer),
	};
}

export function validateWorkflowPresetRoles(
	roles: WorkflowPresetRoles,
	available: readonly Model<Api>[],
): string[] {
	const errors: string[] = [];
	for (const role of WORKFLOW_ROLE_KEYS) {
		const selection = roles[role];
		try {
			parseExplicitModelSelection(
				`${selection.provider}/${selection.model}:${selection.thinking}`,
				available,
			);
		} catch (error) {
			errors.push(`${role}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return errors;
}

export function assertRestrictivePresetPermissions(path: string): boolean {
	return (statSync(path).mode & 0o777) === 0o600;
}
