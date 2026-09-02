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
} from "../launch-profile.ts";
import { parseExplicitModelSelection } from "../model-picker.ts";
import type { NormalizedWorkflowDefinition } from "./types.ts";
import { WORKFLOW_IDENTIFIER_PATTERN } from "./types.ts";

export const WORKFLOW_MODEL_PRESET_VERSION = 1 as const;

export interface WorkflowRoleSelection {
	provider: string;
	model: string;
	thinking: SubagentThinkingLevel;
}

export type WorkflowPresetRoles = Readonly<Record<string, WorkflowRoleSelection>>;

export interface WorkflowModelPreset {
	version: typeof WORKFLOW_MODEL_PRESET_VERSION;
	workflowId: string;
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

function freezeDeep<T>(value: T): T {
	if (Object(value) !== value || value === null || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isThinking(value: unknown): value is SubagentThinkingLevel {
	return typeof value === "string" && THINKING_LEVELS.includes(value as SubagentThinkingLevel);
}

function isWorkflowId(value: unknown): value is string {
	return isNonEmptyString(value) && WORKFLOW_IDENTIFIER_PATTERN.test(value);
}

function isSelection(value: unknown): value is WorkflowRoleSelection {
	if (!isRecord(value) || !hasExactKeys(value, ["provider", "model", "thinking"])) return false;
	return isNonEmptyString(value.provider)
		&& isNonEmptyString(value.model)
		&& isThinking(value.thinking);
}

function isRoles(value: unknown): value is WorkflowPresetRoles {
	if (!isRecord(value) || Object.keys(value).length === 0) return false;
	return Object.entries(value).every(
		([roleId, selection]) => WORKFLOW_IDENTIFIER_PATTERN.test(roleId) && isSelection(selection),
	);
}

export function validateWorkflowModelPreset(value: unknown): value is WorkflowModelPreset {
	if (
		!isRecord(value)
		|| !hasExactKeys(value, ["version", "workflowId", "projectRoot", "updatedAt", "roles"])
	) {
		return false;
	}
	return value.version === WORKFLOW_MODEL_PRESET_VERSION
		&& isWorkflowId(value.workflowId)
		&& isNonEmptyString(value.projectRoot)
		&& isNonEmptyString(value.updatedAt)
		&& Number.isFinite(Date.parse(value.updatedAt))
		&& isRoles(value.roles);
}

/**
 * Canonical workflow project identity.
 *
 * Git projects use their repository top-level so workflow presets still match
 * when launched from nested directories. Outside Git, the canonicalized cwd is
 * the documented fallback identity.
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

function normalizeWorkflowId(workflowId: string): string {
	const normalized = workflowId.trim();
	if (!WORKFLOW_IDENTIFIER_PATTERN.test(normalized)) {
		throw new Error(`Workflow ID "${workflowId}" must use the stable lowercase workflow identifier syntax.`);
	}
	return normalized;
}

function cloneSelection(selection: WorkflowRoleSelection): WorkflowRoleSelection {
	return {
		provider: selection.provider,
		model: selection.model,
		thinking: selection.thinking,
	};
}

function exactRoleSetError(
	definition: NormalizedWorkflowDefinition,
	roles: Readonly<Record<string, WorkflowRoleSelection>>,
): string | null {
	const actualRoleIds = Object.keys(roles);
	const missing = definition.roleIds.filter((roleId) => !Object.hasOwn(roles, roleId));
	const unexpected = actualRoleIds
		.filter((roleId) => !definition.roleById[roleId])
		.sort((first, second) => first.localeCompare(second));
	if (missing.length === 0 && unexpected.length === 0 && actualRoleIds.length === definition.roleIds.length) {
		return null;
	}
	const parts: string[] = [];
	if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
	if (unexpected.length > 0) parts.push(`unexpected: ${unexpected.join(", ")}`);
	return `Workflow model preset roles must exactly match workflow "${definition.id}" roles (${parts.join("; ")}).`;
}

export function normalizeWorkflowPresetRoles(
	definition: NormalizedWorkflowDefinition,
	roles: Readonly<Record<string, WorkflowRoleSelection>>,
): WorkflowPresetRoles {
	const mismatch = exactRoleSetError(definition, roles);
	if (mismatch) throw new Error(mismatch);

	const normalized: Record<string, WorkflowRoleSelection> = {};
	for (const roleId of definition.roleIds) {
		const selection = roles[roleId];
		if (!isSelection(selection)) {
			throw new Error(`Workflow model preset role "${roleId}" must contain provider, model, and thinking.`);
		}
		normalized[roleId] = cloneSelection(selection);
	}
	return freezeDeep(normalized);
}

export function workflowPresetKey(projectRoot: string, workflowId: string): string {
	return createHash("sha256")
		.update(`${canonicalProjectRoot(projectRoot)}\u0000${normalizeWorkflowId(workflowId)}`)
		.digest("hex");
}

export function workflowPresetPath(
	projectRoot: string,
	workflowId: string,
	agentDir = getAgentDir(),
): string {
	return join(
		agentDir,
		"state",
		"pi-tmux-subagents",
		"workflow-presets",
		`${workflowPresetKey(projectRoot, workflowId)}.json`,
	);
}

export function readWorkflowModelPreset(
	definition: NormalizedWorkflowDefinition,
	projectRoot: string,
	agentDir = getAgentDir(),
): WorkflowPresetReadResult {
	const canonicalRoot = canonicalProjectRoot(projectRoot);
	const path = workflowPresetPath(canonicalRoot, definition.id, agentDir);
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

	if (!isRecord(parsed) || parsed.version !== WORKFLOW_MODEL_PRESET_VERSION) {
		return {
			status: "invalid",
			path,
			error: `Unsupported workflow model preset version ${String(isRecord(parsed) ? parsed.version : undefined)}`,
		};
	}
	if (!validateWorkflowModelPreset(parsed)) {
		return {
			status: "invalid",
			path,
			error: `Invalid workflow model preset schema in ${path}`,
		};
	}
	if (parsed.workflowId !== definition.id) {
		return {
			status: "invalid",
			path,
			error: `Workflow model preset ${path} belongs to workflow "${parsed.workflowId}", not "${definition.id}".`,
		};
	}
	if (parsed.projectRoot !== canonicalRoot) {
		return {
			status: "invalid",
			path,
			error: `Workflow model preset ${path} has project root "${parsed.projectRoot}", expected "${canonicalRoot}".`,
		};
	}

	let roles: WorkflowPresetRoles;
	try {
		roles = normalizeWorkflowPresetRoles(definition, parsed.roles);
	} catch (error) {
		return {
			status: "invalid",
			path,
			error: `${path}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	return {
		status: "ok",
		preset: freezeDeep({
			version: WORKFLOW_MODEL_PRESET_VERSION,
			workflowId: definition.id,
			projectRoot: canonicalRoot,
			updatedAt: parsed.updatedAt,
			roles,
		}),
		path,
	};
}

export function writeWorkflowModelPreset(
	preset: WorkflowModelPreset,
	agentDir = getAgentDir(),
): string {
	if (!validateWorkflowModelPreset(preset)) {
		throw new Error("Refusing to serialize an invalid workflow model preset");
	}

	const normalized: WorkflowModelPreset = freezeDeep({
		version: WORKFLOW_MODEL_PRESET_VERSION,
		workflowId: normalizeWorkflowId(preset.workflowId),
		projectRoot: canonicalProjectRoot(preset.projectRoot),
		updatedAt: preset.updatedAt,
		roles: freezeDeep(structuredClone(preset.roles)),
	});
	const path = workflowPresetPath(normalized.projectRoot, normalized.workflowId, agentDir);
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
	definition: NormalizedWorkflowDefinition,
	projectRoot: string,
	roles: Readonly<Record<string, WorkflowRoleSelection>>,
	now = new Date(),
): WorkflowModelPreset {
	return freezeDeep({
		version: WORKFLOW_MODEL_PRESET_VERSION,
		workflowId: definition.id,
		projectRoot: canonicalProjectRoot(projectRoot),
		updatedAt: now.toISOString(),
		roles: normalizeWorkflowPresetRoles(definition, roles),
	});
}

export function editWorkflowPresetRoles(
	definition: NormalizedWorkflowDefinition,
	roles: Readonly<Record<string, WorkflowRoleSelection>>,
	updates: Partial<Record<string, WorkflowRoleSelection>>,
): WorkflowPresetRoles {
	const current = normalizeWorkflowPresetRoles(definition, roles);
	const normalized: Record<string, WorkflowRoleSelection> = {};
	for (const updateRoleId of Object.keys(updates)) {
		if (!definition.roleById[updateRoleId]) {
			throw new Error(`Workflow "${definition.id}" has no role "${updateRoleId}".`);
		}
		const update = updates[updateRoleId];
		if (update !== undefined && !isSelection(update)) {
			throw new Error(`Workflow model preset role "${updateRoleId}" must contain provider, model, and thinking.`);
		}
	}
	for (const roleId of definition.roleIds) {
		const update = updates[roleId];
		normalized[roleId] = cloneSelection(update ?? current[roleId]!);
	}
	return freezeDeep(normalized);
}

export function validateWorkflowPresetRoles(
	definition: NormalizedWorkflowDefinition,
	roles: Readonly<Record<string, WorkflowRoleSelection>>,
	available: readonly Model<Api>[],
): string[] {
	let normalized: WorkflowPresetRoles;
	try {
		normalized = normalizeWorkflowPresetRoles(definition, roles);
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
	}

	const errors: string[] = [];
	for (const roleId of definition.roleIds) {
		const selection = normalized[roleId]!;
		try {
			parseExplicitModelSelection(
				`${selection.provider}/${selection.model}:${selection.thinking}`,
				available,
			);
		} catch (error) {
			errors.push(`${roleId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return errors;
}

export function assertRestrictivePresetPermissions(path: string): boolean {
	return (statSync(path).mode & 0o777) === 0o600;
}
