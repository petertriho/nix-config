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

export const LAUNCH_PROFILE_WORKFLOW_VERSION = 1 as const;

export type WorkflowModelPolicy = "parent-per-role" | "per-role";
export type WorkflowAssignmentSource =
	| "parent"
	| "configured"
	| "preset"
	| "preset-edited"
	| "recovery";
export type WorkflowDataValueMap = Partial<Record<string, string>>;

export interface LaunchProfileWorkflowMetadata {
	version: typeof LAUNCH_PROFILE_WORKFLOW_VERSION;
	workflowId: string;
	runId: string;
	roleId: string;
	manifestHash: string;
	skillHash: string;
	policy: WorkflowModelPolicy;
	assignmentSource: WorkflowAssignmentSource;
	projectRoot: string;
	originalDefault?: ModelSelection;
	currentDefault?: ModelSelection;
	data: WorkflowDataValueMap;
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

const HEX_64 = /^[a-f0-9]{64}$/;
const WORKFLOW_IDENTIFIER_PATTERN = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/;
const WORKFLOW_DATA_IDENTIFIER_PATTERN = /^[a-z](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

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

function isWorkflowIdentifier(value: unknown): value is string {
	return isNonEmptyString(value) && WORKFLOW_IDENTIFIER_PATTERN.test(value);
}

function isWorkflowDataValueMap(value: unknown): value is WorkflowDataValueMap {
	if (!isRecord(value)) return false;
	return Object.entries(value).every(
		([key, entryValue]) =>
			WORKFLOW_DATA_IDENTIFIER_PATTERN.test(key)
			&& isNonEmptyString(entryValue),
	);
}

function normalizeWorkflowDataValues(
	values: Readonly<Record<string, unknown>> | undefined,
): WorkflowDataValueMap {
	const normalized: WorkflowDataValueMap = {};
	if (!values) return normalized;
	for (const [key, value] of Object.entries(values)) {
		if (!WORKFLOW_DATA_IDENTIFIER_PATTERN.test(key)) continue;
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) normalized[key] = trimmed;
	}
	return normalized;
}

function isWorkflowPolicy(value: unknown): value is WorkflowModelPolicy {
	return value === "parent-per-role" || value === "per-role";
}

function workflowValidationError(value: unknown): string | undefined {
	if (!isRecord(value)) {
		return "workflow metadata must be an object.";
	}

	if (
		hasExactKeys(
			value,
			["phase", "policy", "assignmentSource", "artifacts"],
			["projectRoot", "originalDefault", "currentDefault"],
		)
	) {
		return "workflow metadata uses the retired /pter phase/artifact shape. Re-launch the workflow so the sidecar records versioned workflowId/runId/roleId/data metadata.";
	}

	if (
		!hasExactKeys(
			value,
			[
				"version",
				"workflowId",
				"runId",
				"roleId",
				"manifestHash",
				"skillHash",
				"policy",
				"assignmentSource",
				"projectRoot",
				"data",
			],
			["originalDefault", "currentDefault"],
		)
	) {
		return "workflow metadata must include only version, workflowId, runId, roleId, manifestHash, skillHash, policy, assignmentSource, projectRoot, data, and optional originalDefault/currentDefault fields.";
	}

	if (value.version !== LAUNCH_PROFILE_WORKFLOW_VERSION) {
		return `workflow metadata.version must be ${LAUNCH_PROFILE_WORKFLOW_VERSION}.`;
	}
	if (!isWorkflowIdentifier(value.workflowId)) {
		return "workflow metadata.workflowId must be a stable lowercase workflow identifier.";
	}
	if (!isNonEmptyString(value.runId)) {
		return "workflow metadata.runId must be a non-empty string.";
	}
	if (!isWorkflowIdentifier(value.roleId)) {
		return "workflow metadata.roleId must be a stable lowercase workflow role identifier.";
	}
	if (!HEX_64.test(String(value.manifestHash))) {
		return "workflow metadata.manifestHash must be a 64-character lowercase hex hash.";
	}
	if (!HEX_64.test(String(value.skillHash))) {
		return "workflow metadata.skillHash must be a 64-character lowercase hex hash.";
	}
	if (!isWorkflowPolicy(value.policy)) {
		return 'workflow metadata.policy must be "parent-per-role" or "per-role".';
	}
	if (
		!["parent", "configured", "preset", "preset-edited", "recovery"].includes(
			String(value.assignmentSource),
		)
	) {
		return "workflow metadata.assignmentSource is invalid.";
	}
	if (!isNonEmptyString(value.projectRoot) || value.projectRoot.trim().length === 0) {
		return "workflow metadata.projectRoot must be a non-empty string.";
	}
	if (value.originalDefault !== undefined && !isModelSelection(value.originalDefault)) {
		return "workflow metadata.originalDefault is invalid.";
	}
	if (value.currentDefault !== undefined && !isModelSelection(value.currentDefault)) {
		return "workflow metadata.currentDefault is invalid.";
	}
	if (!isWorkflowDataValueMap(value.data)) {
		return "workflow metadata.data must be an object of string workflow data values.";
	}

	return undefined;
}

function isLineage(value: unknown): value is RolloverLineage {
	if (!isRecord(value) || !hasExactKeys(value, [], ["rolledOverFrom", "rolledOverTo"])) {
		return false;
	}
	return (value.rolledOverFrom === undefined || isNonEmptyString(value.rolledOverFrom))
		&& (value.rolledOverTo === undefined || isNonEmptyString(value.rolledOverTo));
}

function launchProfileValidationError(value: unknown): string | undefined {
	if (
		!isRecord(value)
		|| !hasExactKeys(value, ["version", "stable", "runtime", "resources"], ["workflow", "lineage"])
	) {
		return "launch profile must include version, stable, runtime, resources, and optional workflow/lineage fields only.";
	}
	if (value.version !== LAUNCH_PROFILE_VERSION) {
		return `launch profile.version must be ${LAUNCH_PROFILE_VERSION}.`;
	}
	if (!isStableState(value.stable)) return "launch profile.stable is invalid.";
	if (!isRuntimeState(value.runtime)) return "launch profile.runtime is invalid.";
	if (!isResources(value.resources)) return "launch profile.resources is invalid.";
	if (value.workflow !== undefined) {
		const workflowError = workflowValidationError(value.workflow);
		if (workflowError) return workflowError;
	}
	if (value.lineage !== undefined && !isLineage(value.lineage)) {
		return "launch profile.lineage is invalid.";
	}
	return undefined;
}

export function validateLaunchProfile(value: unknown): value is LaunchProfile {
	return launchProfileValidationError(value) === undefined;
}

export function normalizeLaunchProfileWorkflowMetadata(
	value: LaunchProfileWorkflowMetadata,
): LaunchProfileWorkflowMetadata {
	if (!isRecord(value)) {
		throw new Error("Workflow metadata must be an object.");
	}
	const workflowId = value.workflowId?.trim();
	if (!workflowId || !isWorkflowIdentifier(workflowId)) {
		throw new Error("Workflow metadata needs a stable lowercase workflowId.");
	}
	const roleId = value.roleId?.trim();
	if (!roleId || !isWorkflowIdentifier(roleId)) {
		throw new Error("Workflow metadata needs a stable lowercase roleId.");
	}
	if (!isWorkflowPolicy(value.policy)) {
		throw new Error('Workflow metadata policy must be "parent-per-role" or "per-role".');
	}
	if (
		!["parent", "configured", "preset", "preset-edited", "recovery"].includes(
			String(value.assignmentSource),
		)
	) {
		throw new Error("Workflow metadata assignmentSource is invalid.");
	}
	if (value.originalDefault !== undefined && !isModelSelection(value.originalDefault)) {
		throw new Error("Workflow metadata originalDefault is invalid.");
	}
	if (value.currentDefault !== undefined && !isModelSelection(value.currentDefault)) {
		throw new Error("Workflow metadata currentDefault is invalid.");
	}
	const runId = value.runId?.trim();
	if (!runId) {
		throw new Error("Workflow metadata needs a runId.");
	}
	const manifestHash = value.manifestHash?.trim();
	if (!manifestHash || !HEX_64.test(manifestHash)) {
		throw new Error("Workflow metadata needs a 64-character lowercase manifestHash.");
	}
	const skillHash = value.skillHash?.trim();
	if (!skillHash || !HEX_64.test(skillHash)) {
		throw new Error("Workflow metadata needs a 64-character lowercase skillHash.");
	}
	const projectRoot = value.projectRoot?.trim();
	if (!projectRoot) {
		throw new Error("Workflow metadata needs a non-empty projectRoot.");
	}

	const data = normalizeWorkflowDataValues(value.data as Record<string, unknown>);

	return {
		version: LAUNCH_PROFILE_WORKFLOW_VERSION,
		workflowId,
		runId,
		roleId,
		manifestHash,
		skillHash,
		policy: value.policy,
		assignmentSource: value.assignmentSource,
		projectRoot,
		...(value.originalDefault ? { originalDefault: value.originalDefault } : {}),
		...(value.currentDefault ? { currentDefault: value.currentDefault } : {}),
		data,
	};
}

export function mergeLaunchProfileWorkflowData(
	workflow: LaunchProfileWorkflowMetadata,
	updates: WorkflowDataValueMap,
): LaunchProfileWorkflowMetadata {
	const normalized = normalizeLaunchProfileWorkflowMetadata(workflow);
	return normalizeLaunchProfileWorkflowMetadata({
		...normalized,
		data: {
			...(normalized.data ?? {}),
			...normalizeWorkflowDataValues(updates as Record<string, unknown>),
		},
	});
}

export function profilePathForSession(sessionPath: string): string {
	return `${sessionPath}.subagent.json`;
}

export function hashText(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function fingerprintStrings(values: readonly string[]): ResourceFingerprint {
	const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
		.sort((first, second) => first.localeCompare(second));
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
	const validationError = launchProfileValidationError(parsed);
	if (validationError) {
		return { status: "invalid", error: `Invalid launch profile schema in ${path}: ${validationError}` };
	}
	if (!validateLaunchProfile(parsed)) {
		return { status: "invalid", error: `Invalid launch profile schema in ${path}` };
	}
	return { status: "ok", profile: parsed };
}

export function writeLaunchProfile(sessionPath: string, profile: LaunchProfile): string {
	const validationError = launchProfileValidationError(profile);
	if (validationError) {
		throw new Error(`Refusing to serialize an invalid launch profile: ${validationError}`);
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
