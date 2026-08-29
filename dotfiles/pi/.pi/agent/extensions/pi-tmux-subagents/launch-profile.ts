import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname } from "node:path";

export const LAUNCH_PROFILE_VERSION = 1 as const;

export const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

export type SubagentThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface ModelSelection {
	provider: string;
	model: string;
	thinking?: SubagentThinkingLevel;
}

export interface ResourceFingerprint {
	hash: string;
	count: number;
}

export interface LaunchProfileResources {
	tools: ResourceFingerprint;
	visibleSkills: ResourceFingerprint;
	updatedAt: string;
}

export interface PrimarySkillIdentity {
	name: string;
	path?: string;
	hash: string;
}

export interface LaunchProfileControls {
	spawning?: boolean;
	denyTools: string[];
	autoExit?: boolean;
	interactive: boolean;
	sessionMode: "standalone" | "lineage-only" | "fork";
}

export interface LaunchProfileStableState {
	agentName?: string;
	displayName: string;
	roleBody: string;
	roleBodyHash: string;
	systemPromptMode: "append" | "replace" | "message";
	cwd: string;
	agentDir: string;
	controls: LaunchProfileControls;
	primarySkill?: PrimarySkillIdentity;
	originalSessionPath: string;
	createdAt: string;
}

export interface ContextEstimateRecord {
	tokens: number;
	contextWindow: number;
	ratio: number;
	estimatedAt: string;
}

export interface ProviderFailureRecord {
	kind: "usage" | "retry-exhausted" | "other";
	message: string;
	provider?: string;
	model?: string;
	recordedAt: string;
}

export interface LaunchProfileRuntimeState {
	originalModel?: ModelSelection;
	lastModel?: ModelSelection;
	resumeCount: number;
	lastContextEstimate?: ContextEstimateRecord;
	previousFailure?: ProviderFailureRecord;
}

export type WorkflowPhase = "planner" | "task-writer" | "implementer" | "reviewer";
export type WorkflowModelPolicy = "parent-per-phase" | "per-role";
export type WorkflowAssignmentSource =
	| "parent"
	| "configured"
	| "preset"
	| "preset-edited"
	| "recovery";

export interface WorkflowArtifacts {
	plan?: string;
	tasks?: string;
	review?: string;
	baseRef?: string;
}

export interface LaunchProfileWorkflowMetadata {
	phase: WorkflowPhase;
	policy: WorkflowModelPolicy;
	assignmentSource: WorkflowAssignmentSource;
	projectRoot?: string;
	originalDefault?: ModelSelection;
	currentDefault?: ModelSelection;
	artifacts: WorkflowArtifacts;
}

export interface RolloverLineage {
	rolledOverFrom?: string;
	rolledOverTo?: string;
}

export interface LaunchProfile {
	version: typeof LAUNCH_PROFILE_VERSION;
	stable: LaunchProfileStableState;
	runtime: LaunchProfileRuntimeState;
	resources: LaunchProfileResources;
	workflow?: LaunchProfileWorkflowMetadata;
	lineage?: RolloverLineage;
}

export type LaunchProfileReadResult =
	| { status: "ok"; profile: LaunchProfile }
	| { status: "missing" }
	| { status: "invalid"; error: string };

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

function isIsoDate(value: unknown): value is string {
	return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isFiniteNonNegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isThinkingLevel(value: unknown): value is SubagentThinkingLevel {
	return typeof value === "string" && THINKING_LEVELS.includes(value as SubagentThinkingLevel);
}

function isModelSelection(value: unknown): value is ModelSelection {
	if (!isRecord(value) || !hasExactKeys(value, ["provider", "model"], ["thinking"])) return false;
	return isNonEmptyString(value.provider)
		&& isNonEmptyString(value.model)
		&& (value.thinking === undefined || isThinkingLevel(value.thinking));
}

function isFingerprint(value: unknown): value is ResourceFingerprint {
	if (!isRecord(value) || !hasExactKeys(value, ["hash", "count"])) return false;
	return /^[a-f0-9]{64}$/.test(String(value.hash))
		&& Number.isInteger(value.count)
		&& Number(value.count) >= 0;
}

function isPrimarySkill(value: unknown): value is PrimarySkillIdentity {
	if (!isRecord(value) || !hasExactKeys(value, ["name", "hash"], ["path"])) return false;
	return isNonEmptyString(value.name)
		&& /^[a-f0-9]{64}$/.test(String(value.hash))
		&& (value.path === undefined || isNonEmptyString(value.path));
}

function isControls(value: unknown): value is LaunchProfileControls {
	if (
		!isRecord(value)
		|| !hasExactKeys(
			value,
			["denyTools", "interactive", "sessionMode"],
			["spawning", "autoExit"],
		)
	) {
		return false;
	}
	return Array.isArray(value.denyTools)
		&& value.denyTools.every(isNonEmptyString)
		&& typeof value.interactive === "boolean"
		&& ["standalone", "lineage-only", "fork"].includes(String(value.sessionMode))
		&& (value.spawning === undefined || typeof value.spawning === "boolean")
		&& (value.autoExit === undefined || typeof value.autoExit === "boolean");
}

function isStableState(value: unknown): value is LaunchProfileStableState {
	if (
		!isRecord(value)
		|| !hasExactKeys(
			value,
			[
				"displayName",
				"roleBody",
				"roleBodyHash",
				"systemPromptMode",
				"cwd",
				"agentDir",
				"controls",
				"originalSessionPath",
				"createdAt",
			],
			["agentName", "primarySkill"],
		)
	) {
		return false;
	}
	return (value.agentName === undefined || isNonEmptyString(value.agentName))
		&& isNonEmptyString(value.displayName)
		&& typeof value.roleBody === "string"
		&& /^[a-f0-9]{64}$/.test(String(value.roleBodyHash))
		&& ["append", "replace", "message"].includes(String(value.systemPromptMode))
		&& isNonEmptyString(value.cwd)
		&& isNonEmptyString(value.agentDir)
		&& isControls(value.controls)
		&& (value.primarySkill === undefined || isPrimarySkill(value.primarySkill))
		&& isNonEmptyString(value.originalSessionPath)
		&& isIsoDate(value.createdAt);
}

function isContextEstimate(value: unknown): value is ContextEstimateRecord {
	if (
		!isRecord(value)
		|| !hasExactKeys(value, ["tokens", "contextWindow", "ratio", "estimatedAt"])
	) {
		return false;
	}
	return isFiniteNonNegative(value.tokens)
		&& isFiniteNonNegative(value.contextWindow)
		&& value.contextWindow > 0
		&& isFiniteNonNegative(value.ratio)
		&& isIsoDate(value.estimatedAt);
}

function isProviderFailure(value: unknown): value is ProviderFailureRecord {
	if (
		!isRecord(value)
		|| !hasExactKeys(value, ["kind", "message", "recordedAt"], ["provider", "model"])
	) {
		return false;
	}
	return ["usage", "retry-exhausted", "other"].includes(String(value.kind))
		&& isNonEmptyString(value.message)
		&& isIsoDate(value.recordedAt)
		&& (value.provider === undefined || isNonEmptyString(value.provider))
		&& (value.model === undefined || isNonEmptyString(value.model));
}

function isRuntimeState(value: unknown): value is LaunchProfileRuntimeState {
	if (
		!isRecord(value)
		|| !hasExactKeys(
			value,
			["resumeCount"],
			["originalModel", "lastModel", "lastContextEstimate", "previousFailure"],
		)
	) {
		return false;
	}
	return Number.isInteger(value.resumeCount)
		&& Number(value.resumeCount) >= 0
		&& (value.originalModel === undefined || isModelSelection(value.originalModel))
		&& (value.lastModel === undefined || isModelSelection(value.lastModel))
		&& (value.lastContextEstimate === undefined || isContextEstimate(value.lastContextEstimate))
		&& (value.previousFailure === undefined || isProviderFailure(value.previousFailure));
}

function isResources(value: unknown): value is LaunchProfileResources {
	if (!isRecord(value) || !hasExactKeys(value, ["tools", "visibleSkills", "updatedAt"])) {
		return false;
	}
	return isFingerprint(value.tools)
		&& isFingerprint(value.visibleSkills)
		&& isIsoDate(value.updatedAt);
}

function isArtifacts(value: unknown): value is WorkflowArtifacts {
	if (!isRecord(value) || !hasExactKeys(value, [], ["plan", "tasks", "review", "baseRef"])) {
		return false;
	}
	return ["plan", "tasks", "review", "baseRef"].every(
		(key) => value[key] === undefined || isNonEmptyString(value[key]),
	);
}

function isWorkflow(value: unknown): value is LaunchProfileWorkflowMetadata {
	if (
		!isRecord(value)
		|| !hasExactKeys(
			value,
			["phase", "policy", "assignmentSource", "artifacts"],
			["projectRoot", "originalDefault", "currentDefault"],
		)
	) {
		return false;
	}
	return ["planner", "task-writer", "implementer", "reviewer"].includes(String(value.phase))
		&& ["parent-per-phase", "per-role"].includes(String(value.policy))
		&& ["parent", "configured", "preset", "preset-edited", "recovery"].includes(
			String(value.assignmentSource),
		)
		&& (value.projectRoot === undefined || isNonEmptyString(value.projectRoot))
		&& (value.originalDefault === undefined || isModelSelection(value.originalDefault))
		&& (value.currentDefault === undefined || isModelSelection(value.currentDefault))
		&& isArtifacts(value.artifacts);
}

function isLineage(value: unknown): value is RolloverLineage {
	if (!isRecord(value) || !hasExactKeys(value, [], ["rolledOverFrom", "rolledOverTo"])) {
		return false;
	}
	return (value.rolledOverFrom === undefined || isNonEmptyString(value.rolledOverFrom))
		&& (value.rolledOverTo === undefined || isNonEmptyString(value.rolledOverTo));
}

export function validateLaunchProfile(value: unknown): value is LaunchProfile {
	if (
		!isRecord(value)
		|| !hasExactKeys(value, ["version", "stable", "runtime", "resources"], ["workflow", "lineage"])
	) {
		return false;
	}
	return value.version === LAUNCH_PROFILE_VERSION
		&& isStableState(value.stable)
		&& isRuntimeState(value.runtime)
		&& isResources(value.resources)
		&& (value.workflow === undefined || isWorkflow(value.workflow))
		&& (value.lineage === undefined || isLineage(value.lineage));
}

export function profilePathForSession(sessionPath: string): string {
	return `${sessionPath}.subagent.json`;
}

export function hashText(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function fingerprintStrings(values: readonly string[]): ResourceFingerprint {
	const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
	return {
		hash: hashText(normalized.join("\n")),
		count: normalized.length,
	};
}

export function readLaunchProfile(sessionPath: string): LaunchProfileReadResult {
	const path = profilePathForSession(sessionPath);
	if (!existsSync(path)) return { status: "missing" };

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		return {
			status: "invalid",
			error: `Malformed launch profile ${path}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	if (!isRecord(parsed) || parsed.version !== LAUNCH_PROFILE_VERSION) {
		const version = isRecord(parsed) ? parsed.version : undefined;
		return {
			status: "invalid",
			error: `Unsupported launch profile version ${String(version)} in ${path}`,
		};
	}
	if (!validateLaunchProfile(parsed)) {
		return { status: "invalid", error: `Invalid launch profile schema in ${path}` };
	}
	return { status: "ok", profile: parsed };
}

export function writeLaunchProfile(sessionPath: string, profile: LaunchProfile): string {
	if (!validateLaunchProfile(profile)) {
		throw new Error("Refusing to serialize an invalid launch profile");
	}

	const path = profilePathForSession(sessionPath);
	const parent = dirname(path);
	mkdirSync(parent, { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;

	try {
		writeFileSync(temporaryPath, `${JSON.stringify(profile, null, 2)}\n`, {
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

export function removeLaunchProfile(sessionPath: string): void {
	rmSync(profilePathForSession(sessionPath), { force: true });
}

export function updateLaunchProfile(
	sessionPath: string,
	update: (profile: LaunchProfile) => LaunchProfile,
): LaunchProfile {
	const result = readLaunchProfile(sessionPath);
	if (result.status !== "ok") {
		throw new Error(result.status === "invalid" ? result.error : `Launch profile not found for ${sessionPath}`);
	}
	const next = update(structuredClone(result.profile));
	writeLaunchProfile(sessionPath, next);
	return next;
}

export function updateProfileAfterSuccessfulResponse(
	profile: LaunchProfile,
	input: {
		selection?: ModelSelection;
		resources: LaunchProfileResources;
		contextEstimate?: ContextEstimateRecord;
		previousFailure?: ProviderFailureRecord;
	},
): LaunchProfile {
	const next = structuredClone(profile);
	next.runtime.resumeCount += 1;
	if (input.selection) {
		next.runtime.lastModel = input.selection;
		if (next.workflow) {
			next.workflow.currentDefault = input.selection;
		}
	}
	if (input.contextEstimate) next.runtime.lastContextEstimate = input.contextEstimate;
	if (input.previousFailure) next.runtime.previousFailure = input.previousFailure;
	next.resources = input.resources;
	return next;
}
