import { resolve } from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	THINKING_LEVELS,
	type ModelSelection,
	type SubagentThinkingLevel,
} from "../launch-profile.ts";
import { normalizeWorkflowDataValues } from "./schema.ts";
import {
	WORKFLOW_MANIFEST_VERSION,
	WORKFLOW_RUN_SNAPSHOT_VERSION,
	type NormalizedWorkflowDefinition,
	type WorkflowCommandDefinition,
	type WorkflowDataSlot,
	type WorkflowDataValueMap,
	type WorkflowDiagnostic,
	type WorkflowPrivateSkill,
	type WorkflowPrivateSkillFrontmatter,
	type WorkflowRoleDefinition,
	type WorkflowRoleModelSelection,
	type WorkflowRoleSessionSnapshot,
	type WorkflowRunActiveLaunch,
	type WorkflowRunAssignmentSource,
	type WorkflowRunLaunchStatus,
	type WorkflowRunModelPolicy,
	type WorkflowRunSnapshot,
	type WorkflowRunStatus,
	type WorkflowRunStatusSummary,
	type WorkflowSourceScope,
	type WorkflowWriteCapability,
} from "./types.ts";

export const WORKFLOW_RUN_ENTRY_CUSTOM_TYPE = "pi-tmux-subagents.workflow-run";

const WORKFLOW_RUN_STATUSES = ["active", "completed", "aborted"] as const;
const WORKFLOW_RUN_LAUNCH_STATUSES = [
	"starting",
	"running",
	"completed",
	"failed",
	"interrupted",
] as const;
const WORKFLOW_RUN_MODEL_POLICIES = ["parent-per-role", "per-role"] as const;
const WORKFLOW_RUN_ASSIGNMENT_SOURCES = [
	"parent",
	"configured",
	"preset",
	"preset-edited",
] as const;
const WORKFLOW_SOURCE_SCOPES = ["bundled", "global", "project"] as const;
const HEX_64 = /^[a-f0-9]{64}$/;

type UnknownRecord = Record<string, unknown>;

export interface WorkflowRunState {
	readonly activeRunId: string | null;
	readonly runsById: Readonly<Record<string, WorkflowRunSnapshot>>;
	/**
	 * Last-update order for run snapshots in the current branch, oldest first.
	 * Completed and aborted runs stay listed here for audit.
	 */
	readonly runOrder: readonly string[];
}

export interface WorkflowRunPersistTarget {
	appendEntry<T = unknown>(customType: string, data?: T): void;
}

export interface WorkflowRunBranchReader {
	getBranch(): readonly SessionEntry[];
}

export interface WorkflowRunTransitionResult {
	readonly state: WorkflowRunState;
	/**
	 * Snapshots that should be appended to the parent session custom-entry log.
	 * Most transitions append exactly one snapshot; active-run replacement and
	 * interrupted-restore append two or one respectively.
	 */
	readonly snapshots: readonly WorkflowRunSnapshot[];
}

export interface StartWorkflowRunInput {
	readonly runId: string;
	readonly source: WorkflowSourceScope;
	readonly definition: NormalizedWorkflowDefinition;
	readonly projectRoot: string;
	readonly policy: WorkflowRunModelPolicy;
	readonly assignmentSource: WorkflowRunAssignmentSource;
	readonly originalAssignments?: Readonly<Record<string, ModelSelection>>;
	readonly currentAssignments?: Readonly<Record<string, ModelSelection>>;
	readonly data?: Readonly<Record<string, string | undefined>>;
}

export interface WorkflowRunTransitionOptions {
	readonly now?: () => Date;
}

export interface WorkflowRunRoleSessionOptions extends WorkflowRunTransitionOptions {
	readonly launchStatus?: WorkflowRunLaunchStatus;
}

const EMPTY_WORKFLOW_RUN_STATE: WorkflowRunState = freezeDeep({
	activeRunId: null,
	runsById: {},
	runOrder: [],
});

function isRecord(value: unknown): value is UnknownRecord {
	return Object(value) === value && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
	return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isThinkingLevel(value: unknown): value is SubagentThinkingLevel {
	return typeof value === "string" && THINKING_LEVELS.includes(value as SubagentThinkingLevel);
}

function freezeDeep<T>(value: T): T {
	if (Object(value) !== value || value === null || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

function cloneJson<T>(value: T): T {
	return structuredClone(value);
}

function nowIso(now?: () => Date): string {
	return (now?.() ?? new Date()).toISOString();
}

function expectRecord(value: unknown, context: string): UnknownRecord {
	if (!isRecord(value)) throw new Error(`${context} must be an object.`);
	return value;
}

function expectString(value: unknown, context: string): string {
	if (!isNonEmptyString(value)) throw new Error(`${context} must be a non-empty string.`);
	return value.trim();
}

function expectIsoDate(value: unknown, context: string): string {
	const text = expectString(value, context);
	if (!isIsoDate(text)) throw new Error(`${context} must be an ISO-8601 timestamp.`);
	return text;
}

function expectHash(value: unknown, context: string): string {
	const text = expectString(value, context);
	if (!HEX_64.test(text)) throw new Error(`${context} must be a 64-character lowercase hex hash.`);
	return text;
}

function expectOneOf<T extends string>(value: unknown, allowed: readonly T[], context: string): T {
	const text = expectString(value, context);
	if (!allowed.includes(text as T)) {
		throw new Error(`${context} must be one of: ${allowed.join(", ")}.`);
	}
	return text as T;
}

function formatDiagnostics(diagnostics: readonly WorkflowDiagnostic[]): string {
	return diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("\n");
}

function freezeSnapshot(snapshot: WorkflowRunSnapshot): WorkflowRunSnapshot {
	return freezeDeep(cloneJson(snapshot));
}

function freezeState(state: WorkflowRunState): WorkflowRunState {
	return freezeDeep(cloneJson(state));
}

function moveRunIdToEnd(runOrder: readonly string[], runId: string): string[] {
	return [...runOrder.filter((candidate) => candidate !== runId), runId];
}

function buildState(
	runsById: Readonly<Record<string, WorkflowRunSnapshot>>,
	runOrder: readonly string[],
	activeRunId: string | null,
): WorkflowRunState {
	const filteredOrder = runOrder.filter((runId) => Object.hasOwn(runsById, runId));
	const active = activeRunId
		&& Object.hasOwn(runsById, activeRunId)
		&& runsById[activeRunId]?.status === "active"
		? activeRunId
		: null;
	return freezeState({
		activeRunId: active,
		runsById,
		runOrder: filteredOrder,
	});
}

function applySnapshotsToState(
	state: WorkflowRunState,
	snapshots: readonly WorkflowRunSnapshot[],
): WorkflowRunState {
	if (snapshots.length === 0) return state;
	const runsById: Record<string, WorkflowRunSnapshot> = { ...state.runsById };
	let runOrder = [...state.runOrder];
	let activeRunId = state.activeRunId;
	for (const snapshot of snapshots) {
		runsById[snapshot.runId] = snapshot;
		runOrder = moveRunIdToEnd(runOrder, snapshot.runId);
		activeRunId = snapshot.status === "active"
			? snapshot.runId
			: activeRunId === snapshot.runId ? null : activeRunId;
	}
	return buildState(runsById, runOrder, activeRunId);
}

function transition(
	state: WorkflowRunState,
	snapshots: readonly WorkflowRunSnapshot[],
): WorkflowRunTransitionResult {
	return {
		state: applySnapshotsToState(state, snapshots),
		snapshots: freezeDeep([...snapshots]),
	};
}

function normalizeModelSelection(value: unknown, context: string): WorkflowRoleModelSelection {
	const record = expectRecord(value, context);
	const provider = expectString(record.provider, `${context}.provider`);
	const model = expectString(record.model, `${context}.model`);
	const thinking = record.thinking;
	if (thinking !== undefined && !isThinkingLevel(thinking)) {
		throw new Error(
			`${context}.thinking must be one of: ${THINKING_LEVELS.join(", ")}.`,
		);
	}
	return freezeDeep({
		provider,
		model,
		...(thinking ? { thinking } : {}),
	});
}

function normalizeAssignmentMap(
	definition: NormalizedWorkflowDefinition,
	value: unknown,
	context: string,
): Readonly<Record<string, WorkflowRoleModelSelection>> | undefined {
	if (value === undefined) return undefined;
	const record = expectRecord(value, context);
	const normalized: Record<string, WorkflowRoleModelSelection> = {};
	for (const [roleId, selection] of Object.entries(record)) {
		if (!definition.roleById[roleId]) {
			throw new Error(`${context} references unknown workflow role "${roleId}".`);
		}
		normalized[roleId] = normalizeModelSelection(selection, `${context}.${roleId}`);
	}
	return freezeDeep(normalized);
}

function normalizeWorkflowData(
	definition: NormalizedWorkflowDefinition,
	projectRoot: string,
	values: Readonly<Record<string, string | undefined>> | undefined,
): WorkflowDataValueMap {
	if (!values) return freezeDeep({});
	const normalized = normalizeWorkflowDataValues(definition, values, { projectRoot });
	if (normalized.status === "invalid") {
		throw new Error(formatDiagnostics(normalized.diagnostics));
	}
	return normalized.values;
}

function expectRole(definition: NormalizedWorkflowDefinition, roleId: string): WorkflowRoleDefinition {
	const role = definition.roleById[roleId];
	if (!role) throw new Error(`Workflow ${definition.id} has no role "${roleId}".`);
	return role;
}

function normalizeRoleSessionPath(sessionPath: unknown, context: string): string {
	return expectString(sessionPath, context);
}

function normalizeRoleSessions(
	definition: NormalizedWorkflowDefinition,
	value: unknown,
	context: string,
): Readonly<Record<string, WorkflowRoleSessionSnapshot>> {
	if (value === undefined) return freezeDeep({});
	const record = expectRecord(value, context);
	const normalized: Record<string, WorkflowRoleSessionSnapshot> = {};
	for (const [roleId, rawSession] of Object.entries(record)) {
		expectRole(definition, roleId);
		const sessionRecord = expectRecord(rawSession, `${context}.${roleId}`);
		const rawHistory = sessionRecord.history;
		if (rawHistory !== undefined && !Array.isArray(rawHistory)) {
			throw new Error(`${context}.${roleId}.history must be an array.`);
		}
		const history = (rawHistory ?? []).map((entry, index) =>
			normalizeRoleSessionPath(entry, `${context}.${roleId}.history[${index}]`)
		);
		const current = sessionRecord.current === undefined
			? undefined
			: normalizeRoleSessionPath(sessionRecord.current, `${context}.${roleId}.current`);
		normalized[roleId] = freezeDeep({
			...(current ? { current } : {}),
			history,
		});
	}
	return freezeDeep(normalized);
}

function normalizeActiveLaunch(
	definition: NormalizedWorkflowDefinition,
	value: unknown,
	context: string,
): WorkflowRunActiveLaunch | undefined {
	if (value === undefined) return undefined;
	const record = expectRecord(value, context);
	const roleId = expectString(record.roleId, `${context}.roleId`);
	expectRole(definition, roleId);
	const status = expectOneOf(
		record.status,
		WORKFLOW_RUN_LAUNCH_STATUSES,
		`${context}.status`,
	);
	const sessionPath = record.sessionPath === undefined
		? undefined
		: normalizeRoleSessionPath(record.sessionPath, `${context}.sessionPath`);
	return freezeDeep({
		roleId,
		status,
		...(sessionPath ? { sessionPath } : {}),
	});
}

function normalizeCompletedOrAbortedLaunch(
	launch: WorkflowRunActiveLaunch | undefined,
): WorkflowRunActiveLaunch | undefined {
	if (!launch) return undefined;
	if (launch.status !== "starting" && launch.status !== "running") return launch;
	return freezeDeep({ ...launch, status: "interrupted" });
}

function parseCommandDefinition(value: unknown, context: string): WorkflowCommandDefinition {
	const record = expectRecord(value, context);
	const name = expectString(record.name, `${context}.name`);
	const description = expectString(record.description, `${context}.description`);
	const argumentHint = record.argumentHint === undefined
		? undefined
		: expectString(record.argumentHint, `${context}.argumentHint`);
	return freezeDeep({
		name,
		description,
		...(argumentHint ? { argumentHint } : {}),
	});
}

function parseSkillFrontmatter(value: unknown, context: string): WorkflowPrivateSkillFrontmatter {
	const record = expectRecord(value, context);
	const name = expectString(record.name, `${context}.name`);
	const description = expectString(record.description, `${context}.description`);
	const additionalFieldsRecord = record.additionalFields === undefined
		? {}
		: expectRecord(record.additionalFields, `${context}.additionalFields`);
	const additionalFields = Object.fromEntries(
		Object.entries(additionalFieldsRecord).map(([key, raw]) => [key, expectString(raw, `${context}.additionalFields.${key}`)]),
	);
	return freezeDeep({
		name,
		description,
		additionalFields,
	});
}

function parsePrivateSkill(value: unknown, context: string): WorkflowPrivateSkill {
	const record = expectRecord(value, context);
	const path = expectString(record.path, `${context}.path`);
	const hash = expectHash(record.hash, `${context}.hash`);
	const body = expectString(record.body, `${context}.body`);
	return freezeDeep({
		path,
		hash,
		frontmatter: parseSkillFrontmatter(record.frontmatter, `${context}.frontmatter`),
		body,
	});
}

function parseDataSlot(value: unknown, context: string): WorkflowDataSlot {
	const record = expectRecord(value, context);
	const id = expectString(record.id, `${context}.id`);
	const label = expectString(record.label, `${context}.label`);
	const kind = expectOneOf(record.kind, ["file", "string"], `${context}.kind`);
	if (kind === "string") return freezeDeep({ id, kind, label });

	const constraintRecord = record.constraint === undefined
		? undefined
		: expectRecord(record.constraint, `${context}.constraint`);
	const under = constraintRecord ? expectString(constraintRecord.under, `${context}.constraint.under`) : undefined;
	const basename = constraintRecord?.basename === undefined
		? undefined
		: expectString(constraintRecord.basename, `${context}.constraint.basename`);
	return freezeDeep({
		id,
		kind,
		label,
		...(under ? {
			constraint: freezeDeep({
				under,
				...(basename ? { basename } : {}),
			}),
		} : {}),
	});
}

function parseRoleDefinition(value: unknown, context: string): WorkflowRoleDefinition {
	const record = expectRecord(value, context);
	const id = expectString(record.id, `${context}.id`);
	const label = expectString(record.label, `${context}.label`);
	const agent = expectString(record.agent, `${context}.agent`);
	if (!Array.isArray(record.reads)) throw new Error(`${context}.reads must be an array.`);
	if (!Array.isArray(record.writes)) throw new Error(`${context}.writes must be an array.`);
	const reads = record.reads.map((entry, index) => expectString(entry, `${context}.reads[${index}]`));
	const writes: WorkflowWriteCapability[] = record.writes.map((entry, index) => {
		const capability = expectString(entry, `${context}.writes[${index}]`);
		if (capability !== "worktree" && !capability.startsWith("file:")) {
			throw new Error(`${context}.writes[${index}] must be "worktree" or "file:<data-id>".`);
		}
		return capability as WorkflowWriteCapability;
	});
	const handoff = expectString(record.handoff, `${context}.handoff`);
	return freezeDeep({
		id,
		label,
		agent,
		reads,
		writes,
		handoff,
	});
}

function parseNormalizedDefinitionSnapshot(
	value: unknown,
	context = "workflow definition",
): NormalizedWorkflowDefinition {
	const record = expectRecord(value, context);
	const version = record.version;
	if (version !== WORKFLOW_MANIFEST_VERSION) {
		throw new Error(`${context}.version must be ${WORKFLOW_MANIFEST_VERSION}.`);
	}
	const id = expectString(record.id, `${context}.id`);
	const packagePath = expectString(record.packagePath, `${context}.packagePath`);
	const manifestPath = expectString(record.manifestPath, `${context}.manifestPath`);
	const manifestHash = expectHash(record.manifestHash, `${context}.manifestHash`);
	const command = parseCommandDefinition(record.command, `${context}.command`);
	const skillPath = expectString(record.skillPath, `${context}.skillPath`);
	const skill = parsePrivateSkill(record.skill, `${context}.skill`);
	if (skill.path !== skillPath) {
		throw new Error(`${context}.skill.path must match ${context}.skillPath.`);
	}
	const dataRecord = expectRecord(record.data, `${context}.data`);
	const data: Record<string, WorkflowDataSlot> = {};
	for (const [slotId, rawSlot] of Object.entries(dataRecord)) {
		const slot = parseDataSlot(rawSlot, `${context}.data.${slotId}`);
		if (slot.id !== slotId) {
			throw new Error(`${context}.data.${slotId}.id must match its map key.`);
		}
		data[slotId] = slot;
	}
	if (!Array.isArray(record.dataOrder)) {
		throw new Error(`${context}.dataOrder must be an array.`);
	}
	const dataOrder = record.dataOrder.map((entry, index) =>
		expectString(entry, `${context}.dataOrder[${index}]`)
	);
	if (dataOrder.length !== Object.keys(data).length) {
		throw new Error(`${context}.dataOrder must list every data slot exactly once.`);
	}
	for (const slotId of dataOrder) {
		if (!Object.hasOwn(data, slotId)) {
			throw new Error(`${context}.dataOrder references unknown data slot "${slotId}".`);
		}
	}
	if (!Array.isArray(record.roles)) throw new Error(`${context}.roles must be an array.`);
	const roles = record.roles.map((entry, index) => parseRoleDefinition(entry, `${context}.roles[${index}]`));
	const roleIds = record.roleIds;
	if (!Array.isArray(roleIds)) throw new Error(`${context}.roleIds must be an array.`);
	const parsedRoleIds = roleIds.map((entry, index) =>
		expectString(entry, `${context}.roleIds[${index}]`)
	);
	if (parsedRoleIds.length !== roles.length || parsedRoleIds.some((roleId, index) => roleId !== roles[index]?.id)) {
		throw new Error(`${context}.roleIds must match the declared role order exactly.`);
	}
	const roleByIdRecord = expectRecord(record.roleById, `${context}.roleById`);
	const roleById: Record<string, WorkflowRoleDefinition> = {};
	for (const [roleId, rawRole] of Object.entries(roleByIdRecord)) {
		const role = parseRoleDefinition(rawRole, `${context}.roleById.${roleId}`);
		if (role.id !== roleId) {
			throw new Error(`${context}.roleById.${roleId}.id must match its map key.`);
		}
		roleById[roleId] = role;
	}
	for (const role of roles) {
		if (!roleById[role.id]) {
			throw new Error(`${context}.roleById is missing "${role.id}".`);
		}
	}
	return freezeDeep({
		version: WORKFLOW_MANIFEST_VERSION,
		id,
		packagePath,
		manifestPath,
		manifestHash,
		command,
		skillPath,
		skill,
		data,
		dataOrder,
		roles,
		roleIds: parsedRoleIds,
		roleById,
	});
}

function parseWorkflowRunSnapshot(value: unknown): WorkflowRunSnapshot {
	const record = expectRecord(value, "workflow run snapshot");
	const version = record.version;
	if (version !== WORKFLOW_RUN_SNAPSHOT_VERSION) {
		throw new Error(`workflow run snapshot.version must be ${WORKFLOW_RUN_SNAPSHOT_VERSION}.`);
	}
	const definition = parseNormalizedDefinitionSnapshot(record.definition);
	const runId = expectString(record.runId, "workflow run snapshot.runId");
	const workflowId = expectString(record.workflowId, "workflow run snapshot.workflowId");
	if (workflowId !== definition.id) {
		throw new Error("workflow run snapshot.workflowId must match definition.id.");
	}
	const status = expectOneOf(record.status, WORKFLOW_RUN_STATUSES, "workflow run snapshot.status");
	const projectRoot = resolve(expectString(record.projectRoot, "workflow run snapshot.projectRoot"));
	const packagePath = expectString(record.packagePath, "workflow run snapshot.packagePath");
	if (packagePath !== definition.packagePath) {
		throw new Error("workflow run snapshot.packagePath must match definition.packagePath.");
	}
	const source = expectOneOf(record.source, WORKFLOW_SOURCE_SCOPES, "workflow run snapshot.source");
	const manifestHash = expectHash(record.manifestHash, "workflow run snapshot.manifestHash");
	if (manifestHash !== definition.manifestHash) {
		throw new Error("workflow run snapshot.manifestHash must match definition.manifestHash.");
	}
	const skillHash = expectHash(record.skillHash, "workflow run snapshot.skillHash");
	if (skillHash !== definition.skill.hash) {
		throw new Error("workflow run snapshot.skillHash must match definition.skill.hash.");
	}
	const policy = expectOneOf(
		record.policy,
		WORKFLOW_RUN_MODEL_POLICIES,
		"workflow run snapshot.policy",
	);
	const assignmentSource = expectOneOf(
		record.assignmentSource,
		WORKFLOW_RUN_ASSIGNMENT_SOURCES,
		"workflow run snapshot.assignmentSource",
	);
	const originalAssignments = normalizeAssignmentMap(
		definition,
		record.originalAssignments,
		"workflow run snapshot.originalAssignments",
	);
	const currentAssignments = normalizeAssignmentMap(
		definition,
		record.currentAssignments,
		"workflow run snapshot.currentAssignments",
	);
	const data = normalizeWorkflowData(
		definition,
		projectRoot,
		(record.data ?? {}) as Readonly<Record<string, string | undefined>>,
	);
	const roleSessions = normalizeRoleSessions(
		definition,
		record.roleSessions,
		"workflow run snapshot.roleSessions",
	);
	const activeLaunch = normalizeActiveLaunch(
		definition,
		record.activeLaunch,
		"workflow run snapshot.activeLaunch",
	);
	const startedAt = expectIsoDate(record.startedAt, "workflow run snapshot.startedAt");
	const updatedAt = expectIsoDate(record.updatedAt, "workflow run snapshot.updatedAt");
	const finishedAt = record.finishedAt === undefined
		? undefined
		: expectIsoDate(record.finishedAt, "workflow run snapshot.finishedAt");
	return freezeSnapshot({
		version: WORKFLOW_RUN_SNAPSHOT_VERSION,
		runId,
		workflowId,
		status,
		projectRoot,
		packagePath,
		source,
		definition,
		manifestHash,
		skillHash,
		policy,
		assignmentSource,
		...(originalAssignments ? { originalAssignments } : {}),
		...(currentAssignments ? { currentAssignments } : {}),
		data,
		roleSessions,
		...(activeLaunch ? { activeLaunch } : {}),
		startedAt,
		updatedAt,
		...(finishedAt ? { finishedAt } : {}),
	});
}

function maybeParseWorkflowRunSnapshot(value: unknown): WorkflowRunSnapshot | null {
	try {
		return parseWorkflowRunSnapshot(value);
	} catch {
		return null;
	}
}

function assertRunIdAvailable(state: WorkflowRunState, runId: string): void {
	if (Object.hasOwn(state.runsById, runId)) {
		throw new Error(`Workflow run "${runId}" already exists in this parent session.`);
	}
}

function requireActiveRun(state: WorkflowRunState, runId: string): WorkflowRunSnapshot {
	const normalizedRunId = expectString(runId, "workflow run ID");
	if (state.activeRunId === normalizedRunId) {
		const snapshot = state.runsById[normalizedRunId];
		if (snapshot?.status === "active") return snapshot;
	}

	const existing = state.runsById[normalizedRunId];
	if (!state.activeRunId) {
		if (existing) {
			throw new Error(`Workflow run "${normalizedRunId}" is stale because it is already ${existing.status}.`);
		}
		throw new Error(`Workflow run "${normalizedRunId}" is stale or unknown.`);
	}
	if (existing) {
		throw new Error(
			`Workflow run "${normalizedRunId}" is stale because active run "${state.activeRunId}" replaced it.`,
		);
	}
	throw new Error(
		`Workflow run "${normalizedRunId}" is stale because active run "${state.activeRunId}" is now current.`,
	);
}

function buildSnapshot(input: {
	runId: string;
	source: WorkflowSourceScope;
	definition: NormalizedWorkflowDefinition;
	projectRoot: string;
	policy: WorkflowRunModelPolicy;
	assignmentSource: WorkflowRunAssignmentSource;
	originalAssignments?: Readonly<Record<string, WorkflowRoleModelSelection>>;
	currentAssignments?: Readonly<Record<string, WorkflowRoleModelSelection>>;
	data: WorkflowDataValueMap;
	roleSessions?: Readonly<Record<string, WorkflowRoleSessionSnapshot>>;
	activeLaunch?: WorkflowRunActiveLaunch;
	startedAt: string;
	updatedAt: string;
	status: WorkflowRunStatus;
	finishedAt?: string;
}): WorkflowRunSnapshot {
	return freezeSnapshot({
		version: WORKFLOW_RUN_SNAPSHOT_VERSION,
		runId: input.runId,
		workflowId: input.definition.id,
		status: input.status,
		projectRoot: resolve(input.projectRoot),
		packagePath: input.definition.packagePath,
		source: input.source,
		definition: input.definition,
		manifestHash: input.definition.manifestHash,
		skillHash: input.definition.skill.hash,
		policy: input.policy,
		assignmentSource: input.assignmentSource,
		...(input.originalAssignments ? { originalAssignments: input.originalAssignments } : {}),
		...(input.currentAssignments ? { currentAssignments: input.currentAssignments } : {}),
		data: input.data,
		roleSessions: input.roleSessions ?? freezeDeep({}),
		...(input.activeLaunch ? { activeLaunch: input.activeLaunch } : {}),
		startedAt: input.startedAt,
		updatedAt: input.updatedAt,
		...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
	});
}

export function createWorkflowRunState(): WorkflowRunState {
	return EMPTY_WORKFLOW_RUN_STATE;
}

export function getActiveWorkflowRun(state: WorkflowRunState): WorkflowRunSnapshot | null {
	return state.activeRunId ? state.runsById[state.activeRunId] ?? null : null;
}

export function getWorkflowRunSnapshot(
	state: WorkflowRunState,
	runId: string,
): WorkflowRunSnapshot | null {
	return state.runsById[runId] ?? null;
}

export function listWorkflowRunSnapshots(state: WorkflowRunState): readonly WorkflowRunSnapshot[] {
	return freezeDeep(state.runOrder.map((runId) => state.runsById[runId]).filter(Boolean));
}

export function summarizeWorkflowRun(
	snapshot: WorkflowRunSnapshot | null,
): WorkflowRunStatusSummary {
	if (!snapshot) {
		return freezeDeep({
			active: false,
			interrupted: false,
			currentRoleSessions: {},
		});
	}
	const currentRoleSessions: Record<string, string> = {};
	for (const [roleId, session] of Object.entries(snapshot.roleSessions)) {
		if (session.current) currentRoleSessions[roleId] = session.current;
	}
	const activeLaunch = snapshot.activeLaunch
		? {
			roleId: snapshot.activeLaunch.roleId,
			roleLabel: snapshot.definition.roleById[snapshot.activeLaunch.roleId]?.label,
			...(snapshot.activeLaunch.sessionPath ? { sessionPath: snapshot.activeLaunch.sessionPath } : {}),
			status: snapshot.activeLaunch.status,
			interrupted: snapshot.activeLaunch.status === "interrupted",
		}
		: undefined;
	return freezeDeep({
		active: snapshot.status === "active",
		interrupted: snapshot.activeLaunch?.status === "interrupted",
		runId: snapshot.runId,
		workflowId: snapshot.workflowId,
		status: snapshot.status,
		projectRoot: snapshot.projectRoot,
		packagePath: snapshot.packagePath,
		source: snapshot.source,
		startedAt: snapshot.startedAt,
		updatedAt: snapshot.updatedAt,
		...(snapshot.finishedAt ? { finishedAt: snapshot.finishedAt } : {}),
		currentRoleSessions,
		...(activeLaunch ? { activeLaunch } : {}),
	});
}

export function persistWorkflowRunSnapshots(
	target: WorkflowRunPersistTarget,
	snapshots: readonly WorkflowRunSnapshot[],
): void {
	for (const snapshot of snapshots) {
		target.appendEntry(WORKFLOW_RUN_ENTRY_CUSTOM_TYPE, snapshot);
	}
}

export function restoreWorkflowRunStateFromBranch(
	branch: readonly SessionEntry[],
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	let state = createWorkflowRunState();
	for (const entry of branch) {
		if (entry.type !== "custom" || entry.customType !== WORKFLOW_RUN_ENTRY_CUSTOM_TYPE) continue;
		const snapshot = maybeParseWorkflowRunSnapshot(entry.data);
		if (!snapshot) continue;
		state = applySnapshotsToState(state, [snapshot]);
	}

	const active = getActiveWorkflowRun(state);
	if (!active?.activeLaunch) return { state, snapshots: freezeDeep([]) };
	if (active.activeLaunch.status !== "starting" && active.activeLaunch.status !== "running") {
		return { state, snapshots: freezeDeep([]) };
	}

	const interrupted = freezeSnapshot({
		...active,
		activeLaunch: {
			...active.activeLaunch,
			status: "interrupted",
		},
		updatedAt: nowIso(options.now),
	});
	return transition(state, [interrupted]);
}

export function restoreWorkflowRunStateFromSession(
	sessionManager: WorkflowRunBranchReader,
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	return restoreWorkflowRunStateFromBranch(sessionManager.getBranch(), options);
}

export function startWorkflowRun(
	state: WorkflowRunState,
	input: StartWorkflowRunInput,
	options: WorkflowRunTransitionOptions & {
		readonly replaceActive?: boolean;
	} = {},
): WorkflowRunTransitionResult {
	const runId = expectString(input.runId, "workflow run ID");
	assertRunIdAvailable(state, runId);
	const active = getActiveWorkflowRun(state);
	if (active && !options.replaceActive) {
		throw new Error(
			`Workflow run "${active.runId}" is already active. Abort or replace it before starting another run.`,
		);
	}

	const startedAt = nowIso(options.now);
	const definition = parseNormalizedDefinitionSnapshot(input.definition);
	const originalAssignments = normalizeAssignmentMap(
		definition,
		input.originalAssignments,
		"workflow run originalAssignments",
	);
	const currentAssignments = normalizeAssignmentMap(
		definition,
		input.currentAssignments ?? originalAssignments,
		"workflow run currentAssignments",
	);
	const data = normalizeWorkflowData(definition, resolve(input.projectRoot), input.data);

	const snapshots: WorkflowRunSnapshot[] = [];
	let nextState = state;
	if (active) {
		const aborted = freezeSnapshot({
			...active,
			status: "aborted",
			activeLaunch: normalizeCompletedOrAbortedLaunch(active.activeLaunch),
			updatedAt: startedAt,
			finishedAt: startedAt,
		});
		snapshots.push(aborted);
		nextState = applySnapshotsToState(nextState, [aborted]);
	}

	const started = buildSnapshot({
		runId,
		source: expectOneOf(input.source, WORKFLOW_SOURCE_SCOPES, "workflow run source"),
		definition,
		projectRoot: input.projectRoot,
		policy: expectOneOf(input.policy, WORKFLOW_RUN_MODEL_POLICIES, "workflow run policy"),
		assignmentSource: expectOneOf(
			input.assignmentSource,
			WORKFLOW_RUN_ASSIGNMENT_SOURCES,
			"workflow run assignment source",
		),
		...(originalAssignments ? { originalAssignments } : {}),
		...(currentAssignments ? { currentAssignments } : {}),
		data,
		roleSessions: freezeDeep({}),
		startedAt,
		updatedAt: startedAt,
		status: "active",
	});
	snapshots.push(started);
	return {
		state: applySnapshotsToState(nextState, [started]),
		snapshots: freezeDeep(snapshots),
	};
}

export function mergeWorkflowRunData(
	state: WorkflowRunState,
	runId: string,
	updates: Readonly<Record<string, string | undefined>>,
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	const current = requireActiveRun(state, runId);
	const normalizedUpdates = normalizeWorkflowData(current.definition, current.projectRoot, updates);
	const snapshot = freezeSnapshot({
		...current,
		data: freezeDeep({
			...current.data,
			...normalizedUpdates,
		}),
		updatedAt: nowIso(options.now),
	});
	return transition(state, [snapshot]);
}

export function setWorkflowRunActiveLaunch(
	state: WorkflowRunState,
	runId: string,
	launch: WorkflowRunActiveLaunch | undefined,
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	const current = requireActiveRun(state, runId);
	const normalizedLaunch = normalizeActiveLaunch(
		current.definition,
		launch,
		"workflow run activeLaunch",
	);
	const snapshot = freezeSnapshot({
		...current,
		...(normalizedLaunch ? { activeLaunch: normalizedLaunch } : { activeLaunch: undefined }),
		updatedAt: nowIso(options.now),
	});
	return transition(state, [snapshot]);
}

export function recordWorkflowRunRoleSession(
	state: WorkflowRunState,
	runId: string,
	roleId: string,
	sessionPath: string,
	options: WorkflowRunRoleSessionOptions = {},
): WorkflowRunTransitionResult {
	const current = requireActiveRun(state, runId);
	expectRole(current.definition, expectString(roleId, "workflow role ID"));
	const normalizedSessionPath = normalizeRoleSessionPath(sessionPath, "workflow role session path");
	const existing = current.roleSessions[roleId];
	const history = existing?.current && existing.current !== normalizedSessionPath
		? [...existing.history, existing.current]
		: [...(existing?.history ?? [])];
	const roleSessions = freezeDeep({
		...current.roleSessions,
		[roleId]: freezeDeep({
			current: normalizedSessionPath,
			history,
		}),
	});
	const launchStatus = options.launchStatus;
	const activeLaunch = launchStatus
		? freezeDeep({
			roleId,
			sessionPath: normalizedSessionPath,
			status: launchStatus,
		})
		: current.activeLaunch?.roleId === roleId
			? freezeDeep({
				...current.activeLaunch,
				sessionPath: normalizedSessionPath,
			})
			: current.activeLaunch;
	const snapshot = freezeSnapshot({
		...current,
		roleSessions,
		...(activeLaunch ? { activeLaunch } : { activeLaunch: undefined }),
		updatedAt: nowIso(options.now),
	});
	return transition(state, [snapshot]);
}

export function overrideWorkflowRunAssignment(
	state: WorkflowRunState,
	runId: string,
	roleId: string,
	selection: ModelSelection,
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	const current = requireActiveRun(state, runId);
	expectRole(current.definition, expectString(roleId, "workflow role ID"));
	const normalizedSelection = normalizeModelSelection(
		selection,
		`workflow assignment override.${roleId}`,
	);
	const currentAssignments = freezeDeep({
		...(current.currentAssignments ?? current.originalAssignments ?? {}),
		[roleId]: normalizedSelection,
	});
	const snapshot = freezeSnapshot({
		...current,
		currentAssignments,
		updatedAt: nowIso(options.now),
	});
	return transition(state, [snapshot]);
}

function finalizeWorkflowRun(
	state: WorkflowRunState,
	runId: string,
	status: Extract<WorkflowRunStatus, "completed" | "aborted">,
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	const current = requireActiveRun(state, runId);
	const finishedAt = nowIso(options.now);
	const snapshot = freezeSnapshot({
		...current,
		status,
		activeLaunch: status === "aborted"
			? normalizeCompletedOrAbortedLaunch(current.activeLaunch)
			: current.activeLaunch,
		updatedAt: finishedAt,
		finishedAt,
	});
	return transition(state, [snapshot]);
}

export function completeWorkflowRun(
	state: WorkflowRunState,
	runId: string,
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	return finalizeWorkflowRun(state, runId, "completed", options);
}

export function abortWorkflowRun(
	state: WorkflowRunState,
	runId: string,
	options: WorkflowRunTransitionOptions = {},
): WorkflowRunTransitionResult {
	return finalizeWorkflowRun(state, runId, "aborted", options);
}
