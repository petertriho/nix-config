import { existsSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
	type LaunchProfile,
	type LaunchProfileWorkflowMetadata,
	type ModelSelection,
	normalizeLaunchProfileWorkflowMetadata,
	readLaunchProfile,
	updateLaunchProfile,
} from "../launch-profile.ts";
import type { ResolvedModelSelection } from "../model-picker.ts";
import type {
	AgentDefaultsLike,
	BackgroundWatchOptions,
	LaunchContext,
	ResumeLifecycleContext,
	ResumeRecoveryContext,
	RunningSubagent,
	SubagentLaunchParams,
	SubagentResumeParams,
	SubagentResult,
	SubagentToolResult,
} from "../subagent-services.ts";
import {
	resolveResultPresentation,
	resolveUsageDetails,
} from "../subagent-services.ts";
import { estimateSavedSessionContext } from "../context-fit.ts";
import { buildWorkflowRolloverHandoffForRun } from "./handoff.ts";
import {
	RECOVERY_SELECT_MODEL,
	RECOVERY_STOP,
	buildProviderFailureRecord,
	buildWorkflowRecoveryLabels,
	buildWorkflowRecoveryMessage,
	classifyProviderFailure,
	formatFailureKind,
	formatWorkflowRecoverySummary,
	shouldOpenRecoveryGate,
} from "./recovery.ts";
import {
	abortWorkflowRun,
	completeWorkflowRun,
	getActiveWorkflowRun,
	getWorkflowRunSnapshot,
	mergeWorkflowRunData,
	overrideWorkflowRunAssignment,
	recordWorkflowRunRoleSession,
	setWorkflowRunActiveLaunch,
	type WorkflowRunState,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import { resolveWorkflowRoleSelection } from "./startup.ts";
import type {
	WorkflowPresetRoles,
	WorkflowRoleSelection,
} from "./presets.ts";
import type {
	WorkflowRoleDefinition,
	WorkflowRunSnapshot,
} from "./types.ts";
import {
	captureWorkflowWriteBoundarySnapshot,
	resolveWorkflowWritePolicy,
	type WorkflowWriteBoundarySnapshot,
} from "./write-policy.ts";

const ASYNC_WORKFLOW_TOOL_CONTRACT =
	"This is a fire-and-forget workflow lifecycle tool. It returns after the child launch is persisted, "
	+ "then the harness automatically delivers the final subagent_result or subagent_ping as a steer message. "
	+ "Do not poll, sleep, tail session files, or call status tools to wait for completion.";

const ASYNC_BOUNDARY_DETAILS = Object.freeze({
	delivery: "steer",
	resultMessage: "subagent_result",
	pingMessage: "subagent_ping",
	pollingRequired: false,
	launchStatePersisted: true,
});

export const WorkflowDataUpdatesSchema = Type.Optional(
	Type.Record(
		Type.String({ minLength: 1 }),
		Type.String({ minLength: 1 }),
		{
			description:
				"Workflow data updates keyed by manifest data slot ID. File slots require absolute project-contained paths; string slots require non-empty strings.",
		},
	),
);

export const WorkflowSpawnParams = Type.Object({
	runId: Type.String({ minLength: 1, description: "Active workflow run ID" }),
	role: Type.String({ minLength: 1, description: "Explicit manifest role ID" }),
	task: Type.String({ minLength: 1, description: "Task for this fresh role session" }),
	data: WorkflowDataUpdatesSchema,
});

export const WorkflowResumeParams = Type.Object({
	runId: Type.String({ minLength: 1, description: "Active workflow run ID" }),
	role: Type.String({ minLength: 1, description: "Explicit manifest role ID" }),
	message: Type.Optional(
		Type.String({ minLength: 1, description: "Optional continuation instruction" }),
	),
	data: WorkflowDataUpdatesSchema,
	model: Type.Optional(
		Type.String({
			minLength: 1,
			description:
				"Optional resume model policy override: previous, parent, pick, or provider/model[:thinking].",
		}),
	),
});

export const WorkflowRecoverParams = Type.Object({
	runId: Type.String({ minLength: 1, description: "Active workflow run ID" }),
	role: Type.String({ minLength: 1, description: "Explicit manifest role ID" }),
	failure: Type.String({
		minLength: 1,
		description: "Provider failure text from the failed asynchronous role result",
	}),
	message: Type.Optional(
		Type.String({ minLength: 1, description: "Optional latest continuation instruction" }),
	),
	data: WorkflowDataUpdatesSchema,
});

export const WorkflowCompleteParams = Type.Object({
	runId: Type.String({ minLength: 1, description: "Active workflow run ID" }),
	status: StringEnum(["completed", "aborted"] as const, {
		description: "Terminal workflow status",
	}),
	summary: Type.Optional(
		Type.String({ minLength: 1, description: "Optional concise terminal summary" }),
	),
});

export interface WorkflowToolStateStore {
	getState(): WorkflowRunState;
	commit(transition: WorkflowRunTransitionResult): void;
}

export interface WorkflowSubagentExecution {
	launchSubagent(
		params: SubagentLaunchParams,
		ctx: LaunchContext,
		options?: {
			workflow?: LaunchProfileWorkflowMetadata;
			resolvedModel?: ResolvedModelSelection;
		},
	): Promise<RunningSubagent>;
	watchInBackground(options: BackgroundWatchOptions): AbortController;
	executeSubagentResume(
		pi: ExtensionAPI,
		params: SubagentResumeParams,
		ctx: LaunchContext & ExtensionContext,
		recovery?: ResumeRecoveryContext,
		lifecycle?: ResumeLifecycleContext,
	): Promise<SubagentToolResult>;
}

export interface WorkflowToolDependencies {
	state: WorkflowToolStateStore;
	execution: WorkflowSubagentExecution;
	loadAgentDefaults(agentName: string): AgentDefaultsLike | null;
	isTmuxAvailable(): boolean;
	muxUnavailableResult(): SubagentToolResult;
}

interface WorkflowToolExecutionContext extends ExtensionContext {
	sessionManager: ExtensionContext["sessionManager"] & LaunchContext["sessionManager"];
}

interface WorkflowSessionProfile {
	readonly profile: LaunchProfile;
	readonly workflow: LaunchProfileWorkflowMetadata;
}

function formatDiagnostics(
	diagnostics: readonly { path: string; message: string }[],
): string {
	return diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("\n");
}

function cloneSelection(selection: ModelSelection | undefined): ModelSelection | undefined {
	if (!selection) return undefined;
	return {
		provider: selection.provider,
		model: selection.model,
		...(selection.thinking ? { thinking: selection.thinking } : {}),
	};
}

function startupAssignments(
	assignments: Readonly<Record<string, ModelSelection>> | undefined,
): WorkflowPresetRoles | undefined {
	if (!assignments) return undefined;
	const normalized: Record<string, WorkflowRoleSelection> = {};
	for (const [roleId, selection] of Object.entries(assignments)) {
		normalized[roleId] = {
			provider: selection.provider,
			model: selection.model,
			thinking: selection.thinking ?? "off",
		};
	}
	return normalized;
}

function sameSelection(
	first: ModelSelection | undefined,
	second: ModelSelection | undefined,
): boolean {
	return first?.provider === second?.provider
		&& first?.model === second?.model
		&& (first?.thinking ?? "off") === (second?.thinking ?? "off");
}

function activeRunForToken(
	state: WorkflowRunState,
	runId: string,
): WorkflowRunSnapshot {
	const active = getActiveWorkflowRun(state);
	if (active?.runId === runId) return active;

	const existing = getWorkflowRunSnapshot(state, runId);
	if (existing) {
		throw new Error(
			`Workflow run "${runId}" is stale because it is already ${existing.status}.`,
		);
	}
	if (active) {
		throw new Error(
			`Workflow run "${runId}" is stale because active run "${active.runId}" is current.`,
		);
	}
	throw new Error(`Workflow run "${runId}" is stale or unknown.`);
}

function roleForRun(
	snapshot: WorkflowRunSnapshot,
	roleId: string,
): WorkflowRoleDefinition {
	const role = snapshot.definition.roleById[roleId];
	if (!role) {
		throw new Error(
			`Workflow "${snapshot.workflowId}" has no role "${roleId}". Valid roles: ${snapshot.definition.roleIds.join(", ")}.`,
		);
	}
	return role;
}

function mergeDataUpdates(
	deps: WorkflowToolDependencies,
	runId: string,
	updates: Readonly<Record<string, string>> | undefined,
): WorkflowRunSnapshot {
	if (updates && Object.keys(updates).length > 0) {
		deps.state.commit(
			mergeWorkflowRunData(deps.state.getState(), runId, updates),
		);
	}
	return activeRunForToken(deps.state.getState(), runId);
}

function currentRoleSession(
	snapshot: WorkflowRunSnapshot,
	roleId: string,
): string {
	const sessionPath = snapshot.roleSessions[roleId]?.current
		?? (snapshot.activeLaunch?.roleId === roleId
			? snapshot.activeLaunch.sessionPath
			: undefined);
	if (!sessionPath) {
		throw new Error(
			`Workflow role "${roleId}" has no current session. Call workflow_spawn first.`,
		);
	}
	return sessionPath;
}

function assignmentSourceForRole(
	snapshot: WorkflowRunSnapshot,
	roleId: string,
): LaunchProfileWorkflowMetadata["assignmentSource"] {
	const original = snapshot.originalAssignments?.[roleId];
	const current = snapshot.currentAssignments?.[roleId];
	if (current && (!original || !sameSelection(original, current))) return "recovery";
	return snapshot.assignmentSource;
}

function workflowMetadataForRole(
	snapshot: WorkflowRunSnapshot,
	roleId: string,
	currentDefault?: ModelSelection,
): LaunchProfileWorkflowMetadata {
	const originalDefault = cloneSelection(snapshot.originalAssignments?.[roleId]);
	const storedCurrent = cloneSelection(snapshot.currentAssignments?.[roleId]);
	return normalizeLaunchProfileWorkflowMetadata({
		version: 1,
		workflowId: snapshot.workflowId,
		runId: snapshot.runId,
		roleId,
		manifestHash: snapshot.manifestHash,
		skillHash: snapshot.skillHash,
		policy: snapshot.policy,
		assignmentSource: assignmentSourceForRole(snapshot, roleId),
		projectRoot: snapshot.projectRoot,
		...(originalDefault ? { originalDefault } : {}),
		...(currentDefault ?? storedCurrent
			? { currentDefault: cloneSelection(currentDefault ?? storedCurrent)! }
			: {}),
		data: { ...snapshot.data },
	});
}

function readWorkflowSessionProfile(
	snapshot: WorkflowRunSnapshot,
	role: WorkflowRoleDefinition,
	sessionPath: string,
): WorkflowSessionProfile {
	if (!existsSync(sessionPath)) {
		throw new Error(`Workflow role session file not found: ${sessionPath}`);
	}
	const read = readLaunchProfile(sessionPath);
	if (read.status === "missing") {
		throw new Error(
			`Workflow role session "${sessionPath}" has no launch-profile sidecar.`,
		);
	}
	if (read.status === "invalid") throw new Error(read.error);
	const workflow = read.profile.workflow;
	if (!workflow) {
		throw new Error(
			`Session "${sessionPath}" is not associated with a workflow run.`,
		);
	}
	for (const [field, expected, actual] of [
		["workflowId", snapshot.workflowId, workflow.workflowId],
		["runId", snapshot.runId, workflow.runId],
		["roleId", role.id, workflow.roleId],
		["manifestHash", snapshot.manifestHash, workflow.manifestHash],
		["skillHash", snapshot.skillHash, workflow.skillHash],
	] as const) {
		if (actual !== expected) {
			throw new Error(
				`Workflow session metadata ${field} mismatch: expected "${expected}", got "${String(actual)}".`,
			);
		}
	}
	if (
		read.profile.stable.agentName
		&& read.profile.stable.agentName !== role.agent
	) {
		throw new Error(
			`Workflow role "${role.id}" expects agent "${role.agent}", but the current session stores "${read.profile.stable.agentName}".`,
		);
	}
	return { profile: read.profile, workflow };
}

function resolveWriteBoundary(
	snapshot: WorkflowRunSnapshot,
	roleId: string,
): WorkflowWriteBoundarySnapshot | undefined {
	const resolved = resolveWorkflowWritePolicy(
		snapshot.definition,
		roleId,
		snapshot.data,
		{ projectRoot: snapshot.projectRoot },
	);
	if (resolved.status === "invalid") {
		throw new Error(formatDiagnostics(resolved.diagnostics));
	}
	return captureWorkflowWriteBoundarySnapshot(
		resolved.policy,
		snapshot.projectRoot,
	);
}

function recordLaunchStarting(
	deps: WorkflowToolDependencies,
	snapshot: WorkflowRunSnapshot,
	roleId: string,
	sessionPath?: string,
): void {
	deps.state.commit(
		setWorkflowRunActiveLaunch(
			deps.state.getState(),
			snapshot.runId,
			{
				roleId,
				status: "starting",
				...(sessionPath ? { sessionPath } : {}),
			},
		),
	);
}

function recordLaunchedSession(
	deps: WorkflowToolDependencies,
	runId: string,
	roleId: string,
	sessionPath: string,
): void {
	deps.state.commit(
		recordWorkflowRunRoleSession(
			deps.state.getState(),
			runId,
			roleId,
			sessionPath,
			{ launchStatus: "running" },
		),
	);
}

function finishLaunch(
	deps: WorkflowToolDependencies,
	input: {
		runId: string;
		roleId: string;
		sessionPath?: string;
		status: "completed" | "failed";
	},
): void {
	const active = getActiveWorkflowRun(deps.state.getState());
	if (!active || active.runId !== input.runId) return;
	const launch = active.activeLaunch;
	if (!launch || launch.roleId !== input.roleId) return;
	if (
		input.sessionPath
		&& launch.sessionPath
		&& launch.sessionPath !== input.sessionPath
	) {
		return;
	}
	deps.state.commit(
		setWorkflowRunActiveLaunch(
			deps.state.getState(),
			input.runId,
			{
				roleId: input.roleId,
				status: input.status,
				...(input.sessionPath ?? launch.sessionPath
					? { sessionPath: input.sessionPath ?? launch.sessionPath }
					: {}),
			},
		),
	);
}

function launchFinishedStatus(
	result: SubagentResult,
	boundary?: { violationText?: string },
): "completed" | "failed" {
	return result.exitCode === 0
		&& !result.errorMessage
		&& !result.ping
		&& !boundary?.violationText
		? "completed"
		: "failed";
}

function ensureLaunchAvailable(
	deps: WorkflowToolDependencies,
	ctx: WorkflowToolExecutionContext,
): SubagentToolResult | null {
	if (!deps.isTmuxAvailable()) return deps.muxUnavailableResult();
	if (!ctx.sessionManager.getSessionFile()) {
		return {
			content: [{
				type: "text",
				text: "Error: workflow roles require a persistent parent session.",
			}],
			details: { error: "no session file" },
		};
	}
	return null;
}

function workflowDetails(
	snapshot: WorkflowRunSnapshot,
	role: WorkflowRoleDefinition,
	extra: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		workflow: {
			workflowId: snapshot.workflowId,
			runId: snapshot.runId,
			roleId: role.id,
			roleLabel: role.label,
			agent: role.agent,
		},
		asyncBoundary: ASYNC_BOUNDARY_DETAILS,
		...extra,
	};
}

function asynchronousPresentation(
	snapshot: WorkflowRunSnapshot,
	role: WorkflowRoleDefinition,
	running: RunningSubagent,
	result: SubagentResult,
	boundary?: { details: Record<string, unknown>; violationText?: string },
	ctx?: LaunchContext,
): { content: string; details: Record<string, unknown> } {
	const usage = ctx ? resolveUsageDetails(result, ctx) : result.usage;
	const base = resolveResultPresentation(
		{ ...result, ...(usage ? { usage } : {}) },
		running.name,
	);
	return {
		content: boundary?.violationText
			? `${boundary.violationText}\n\n${base}`
			: base,
		details: workflowDetails(snapshot, role, {
			name: running.name,
			task: running.task,
			agent: role.agent,
			exitCode: result.exitCode,
			elapsed: result.elapsed,
			sessionFile: result.sessionFile ?? running.sessionFile,
			...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
			...(result.errorMessage
				? { failureKind: classifyProviderFailure(result.errorMessage) }
				: {}),
			...(usage ? { usage } : {}),
			...(boundary ? boundary.details : {}),
		}),
	};
}

function errorResult(error: unknown): SubagentToolResult {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ type: "text", text: `Error: ${message}` }],
		details: { error: "workflow lifecycle rejected", message },
	};
}

export function createWorkflowLifecycleTools(
	pi: ExtensionAPI,
	deps: WorkflowToolDependencies,
) {
	async function spawn(
		params: {
			runId: string;
			role: string;
			task: string;
			data?: Record<string, string>;
		},
		ctx: WorkflowToolExecutionContext,
	): Promise<SubagentToolResult> {
		let snapshot = activeRunForToken(deps.state.getState(), params.runId);
		const role = roleForRun(snapshot, params.role);
		snapshot = mergeDataUpdates(deps, params.runId, params.data);

		if (!deps.loadAgentDefaults(role.agent)) {
			throw new Error(
				`Workflow role "${role.id}" requires unavailable agent "${role.agent}".`,
			);
		}
		const unavailable = ensureLaunchAvailable(deps, ctx);
		if (unavailable) return unavailable;

		const resolvedModel = await resolveWorkflowRoleSelection(
			ctx,
			snapshot.definition,
			{
				workflowId: snapshot.workflowId,
				policy: snapshot.policy,
				assignmentSource: snapshot.assignmentSource,
				projectRoot: snapshot.projectRoot,
				...(snapshot.originalAssignments
					? { originalAssignments: startupAssignments(snapshot.originalAssignments) }
					: {}),
				...(snapshot.currentAssignments
					? { currentAssignments: snapshot.currentAssignments }
					: {}),
				updatedAt: snapshot.updatedAt,
			},
			role.id,
		);
		const metadata = workflowMetadataForRole(
			snapshot,
			role.id,
			resolvedModel.selection,
		);
		const boundary = resolveWriteBoundary(snapshot, role.id);

		recordLaunchStarting(deps, snapshot, role.id);
		let running: RunningSubagent;
		try {
			running = await deps.execution.launchSubagent(
				{
					name: role.label,
					task: params.task,
					agent: role.agent,
				},
				{ ...ctx, pi },
				{ workflow: metadata, resolvedModel },
			);
		} catch (error) {
			finishLaunch(deps, {
				runId: snapshot.runId,
				roleId: role.id,
				status: "failed",
			});
			throw error;
		}
		if (boundary) running.boundary = boundary;
		recordLaunchedSession(deps, snapshot.runId, role.id, running.sessionFile);

		deps.execution.watchInBackground({
			pi,
			ctx,
			running,
			pingAgent: role.agent,
			pingSessionPath: running.sessionFile,
			onPing: ({ result, boundary: outcome }) => {
				finishLaunch(deps, {
					runId: snapshot.runId,
					roleId: role.id,
					sessionPath: running.sessionFile,
					status: launchFinishedStatus(result, outcome),
				});
			},
			onSuccess: ({ result, boundary: outcome }) => {
				finishLaunch(deps, {
					runId: snapshot.runId,
					roleId: role.id,
					sessionPath: running.sessionFile,
					status: launchFinishedStatus(result, outcome),
				});
				return asynchronousPresentation(
					snapshot,
					role,
					running,
					result,
					outcome,
					ctx,
				);
			},
			onError: (message) => {
				finishLaunch(deps, {
					runId: snapshot.runId,
					roleId: role.id,
					sessionPath: running.sessionFile,
					status: "failed",
				});
				return {
					content: `Workflow role "${role.label}" error: ${message}`,
					details: workflowDetails(snapshot, role, {
						name: running.name,
						error: message,
						sessionFile: running.sessionFile,
					}),
				};
			},
		});

		return {
			content: [{
				type: "text",
				text:
					`Workflow role "${role.label}" launched in the background. `
					+ "The harness will deliver its result automatically; do not poll.",
			}],
			details: workflowDetails(snapshot, role, {
				id: running.id,
				name: running.name,
				status: "started",
				sessionFile: running.sessionFile,
				launchScriptFile: running.launchScriptFile,
			}),
		};
	}

	function resumeLifecycle(
		snapshot: WorkflowRunSnapshot,
		role: WorkflowRoleDefinition,
		boundary: WorkflowWriteBoundarySnapshot | undefined,
		rolloverMessage: string,
		workflowMetadata: LaunchProfileWorkflowMetadata,
	): ResumeLifecycleContext {
		return {
			details: workflowDetails(snapshot, role),
			workflowMetadata,
			...(boundary ? { boundary } : {}),
			rolloverMessage,
			onLaunched: ({ sessionPath }) => {
				recordLaunchedSession(deps, snapshot.runId, role.id, sessionPath);
			},
			onResult: ({ result, boundary: outcome, sessionPath }) => {
				finishLaunch(deps, {
					runId: snapshot.runId,
					roleId: role.id,
					sessionPath,
					status: launchFinishedStatus(result, outcome),
				});
			},
			onError: ({ sessionPath }) => {
				finishLaunch(deps, {
					runId: snapshot.runId,
					roleId: role.id,
					sessionPath,
					status: "failed",
				});
			},
		};
	}

	async function resume(
		params: {
			runId: string;
			role: string;
			message?: string;
			data?: Record<string, string>;
			model?: string;
		},
		ctx: WorkflowToolExecutionContext,
	): Promise<SubagentToolResult> {
		let snapshot = activeRunForToken(deps.state.getState(), params.runId);
		const role = roleForRun(snapshot, params.role);
		snapshot = mergeDataUpdates(deps, params.runId, params.data);
		const sessionPath = currentRoleSession(snapshot, role.id);
		const session = readWorkflowSessionProfile(snapshot, role, sessionPath);
		const unavailable = ensureLaunchAvailable(deps, ctx);
		if (unavailable) return unavailable;
		const boundary = resolveWriteBoundary(snapshot, role.id);
		const metadata = workflowMetadataForRole(
			snapshot,
			role.id,
			session.profile.runtime.lastModel
				?? session.workflow.currentDefault
				?? snapshot.currentAssignments?.[role.id],
		);
		const rolloverMessage = buildWorkflowRolloverHandoffForRun({
			snapshot,
			roleId: role.id,
			...(params.message ? { userMessage: params.message } : {}),
		});

		recordLaunchStarting(deps, snapshot, role.id, sessionPath);
		let result: SubagentToolResult;
		try {
			result = await deps.execution.executeSubagentResume(
				pi,
				{
					sessionPath,
					name: role.label,
					...(params.message ? { message: params.message } : {}),
					...(params.model ? { model: params.model } : {}),
				},
				{ ...ctx, pi },
				undefined,
				resumeLifecycle(snapshot, role, boundary, rolloverMessage, metadata),
			);
		} catch (error) {
			finishLaunch(deps, {
				runId: snapshot.runId,
				roleId: role.id,
				sessionPath,
				status: "failed",
			});
			throw error;
		}
		if (result.details.status !== "started") {
			finishLaunch(deps, {
				runId: snapshot.runId,
				roleId: role.id,
				sessionPath,
				status: "failed",
			});
		}
		return {
			...result,
			details: {
				...workflowDetails(snapshot, role),
				...result.details,
			},
		};
	}

	async function recover(
		params: {
			runId: string;
			role: string;
			failure: string;
			message?: string;
			data?: Record<string, string>;
		},
		ctx: WorkflowToolExecutionContext,
	): Promise<SubagentToolResult> {
		let snapshot = activeRunForToken(deps.state.getState(), params.runId);
		const role = roleForRun(snapshot, params.role);
		snapshot = mergeDataUpdates(deps, params.runId, params.data);
		const sessionPath = currentRoleSession(snapshot, role.id);
		const session = readWorkflowSessionProfile(snapshot, role, sessionPath);
		const failureText = params.failure.trim();
		if (!failureText) throw new Error("Workflow recovery requires provider failure text.");
		const failureKind = classifyProviderFailure(failureText);
		const failedSelection =
			session.profile.runtime.lastModel ?? session.profile.runtime.originalModel;
		const failure = buildProviderFailureRecord({
			kind: failureKind,
			message: failureText,
			...(failedSelection?.provider ? { provider: failedSelection.provider } : {}),
			...(failedSelection?.model ? { model: failedSelection.model } : {}),
		});

		try {
			updateLaunchProfile(sessionPath, (stored) => ({
				...stored,
				runtime: { ...stored.runtime, previousFailure: failure },
			}));
		} catch {
			// Diagnostic sidecar updates are best-effort; the run snapshot owns state.
		}

		if (!shouldOpenRecoveryGate(failureKind)) {
			return {
				content: [{
					type: "text",
					text:
						`Failure classified as "${formatFailureKind(failureKind)}". `
						+ "workflow_recover applies only to quota/usage exhaustion or exhausted normal retries. "
						+ `The ${role.label} session and workflow data are preserved; ask the user whether to retry or resume it.`,
				}],
				details: workflowDetails(snapshot, role, {
					status: "not-opened",
					failureKind,
					sessionPath,
				}),
			};
		}
		if (!ctx.hasUI) {
			return {
				content: [{
					type: "text",
					text:
						"Error: workflow recovery needs interactive UI for the replacement model and thinking picker. "
						+ "The saved role session and workflow data are preserved.",
				}],
				details: workflowDetails(snapshot, role, {
					error: "recovery needs interactive UI",
					failureKind,
					sessionPath,
				}),
			};
		}

		let estimate: ReturnType<typeof estimateSavedSessionContext> | undefined;
		try {
			estimate = estimateSavedSessionContext(sessionPath);
		} catch {
			estimate = undefined;
		}
		const labels = buildWorkflowRecoveryLabels(snapshot, role.id);
		await ctx.ui.notify(
			formatWorkflowRecoverySummary({
				snapshot,
				roleId: role.id,
				failureKind,
				failure: failureText,
				sessionPath,
				...(failedSelection?.provider ? { provider: failedSelection.provider } : {}),
				...(failedSelection?.model ? { model: failedSelection.model } : {}),
				...(estimate ? { estimate } : {}),
			}),
			"error",
		);
		const choice = await ctx.ui.select(
			labels.gatePrompt,
			[RECOVERY_SELECT_MODEL, RECOVERY_STOP],
		);
		if (choice !== RECOVERY_SELECT_MODEL) {
			return {
				content: [{
					type: "text",
					text:
						"Recovery cancelled at the user gate. The saved role session and workflow data are preserved.",
				}],
				details: workflowDetails(snapshot, role, {
					status: "cancelled",
					failureKind,
					sessionPath,
				}),
			};
		}

		const unavailable = ensureLaunchAvailable(deps, ctx);
		if (unavailable) return unavailable;
		const boundary = resolveWriteBoundary(snapshot, role.id);
		const metadata = workflowMetadataForRole(
			snapshot,
			role.id,
			session.profile.runtime.lastModel
				?? session.workflow.currentDefault
				?? snapshot.currentAssignments?.[role.id],
		);
		const continuation = buildWorkflowRecoveryMessage({
			snapshot,
			roleId: role.id,
			...(params.message ? { userMessage: params.message } : {}),
		});
		const lifecycle = resumeLifecycle(
			snapshot,
			role,
			boundary,
			continuation,
			metadata,
		);
		const recovery: ResumeRecoveryContext = {
			failure,
			details: {
				recovery: {
					workflowId: snapshot.workflowId,
					runId: snapshot.runId,
					roleId: role.id,
					roleLabel: role.label,
					failureKind,
				},
			},
			pickerTitle: labels.pickerTitle,
			pickerSubject: labels.pickerSubject,
			transformWorkflowMetadata: (workflow, selection) =>
				normalizeLaunchProfileWorkflowMetadata({
					...workflow,
					assignmentSource: "recovery",
					currentDefault: selection.selection,
					data: { ...snapshot.data },
				}),
			onSuccessfulResponse: (selection) => {
				deps.state.commit(
					overrideWorkflowRunAssignment(
						deps.state.getState(),
						snapshot.runId,
						role.id,
						selection,
					),
				);
				try {
					updateLaunchProfile(
						currentRoleSession(
							activeRunForToken(deps.state.getState(), snapshot.runId),
							role.id,
						),
						(stored) => stored.workflow
							? {
								...stored,
								workflow: normalizeLaunchProfileWorkflowMetadata({
									...stored.workflow,
									assignmentSource: "recovery",
									currentDefault: selection,
									data: {
										...stored.workflow.data,
										...activeRunForToken(
											deps.state.getState(),
											snapshot.runId,
										).data,
									},
								}),
							}
							: stored,
					);
				} catch {
					// The run assignment is authoritative; sidecar refresh is best-effort.
				}
			},
		};

		recordLaunchStarting(deps, snapshot, role.id, sessionPath);
		let result: SubagentToolResult;
		try {
			result = await deps.execution.executeSubagentResume(
				pi,
				{
					sessionPath,
					name: role.label,
					message: continuation,
					model: "pick",
				},
				{ ...ctx, pi },
				recovery,
				lifecycle,
			);
		} catch (error) {
			finishLaunch(deps, {
				runId: snapshot.runId,
				roleId: role.id,
				sessionPath,
				status: "failed",
			});
			throw error;
		}
		if (result.details.status !== "started") {
			finishLaunch(deps, {
				runId: snapshot.runId,
				roleId: role.id,
				sessionPath,
				status: "failed",
			});
		}
		return {
			...result,
			details: {
				...workflowDetails(snapshot, role),
				...result.details,
			},
		};
	}

	function complete(params: {
		runId: string;
		status: "completed" | "aborted";
		summary?: string;
	}): SubagentToolResult {
		const snapshot = activeRunForToken(deps.state.getState(), params.runId);
		const transition = params.status === "completed"
			? completeWorkflowRun(deps.state.getState(), params.runId)
			: abortWorkflowRun(deps.state.getState(), params.runId);
		deps.state.commit(transition);
		return {
			content: [{
				type: "text",
				text:
					`Workflow "${snapshot.workflowId}" ${params.status}.`
					+ (params.summary ? ` ${params.summary.trim()}` : ""),
			}],
			details: {
				workflow: {
					workflowId: snapshot.workflowId,
					runId: snapshot.runId,
					status: params.status,
					data: snapshot.data,
					roleSessions: snapshot.roleSessions,
				},
				...(params.summary ? { summary: params.summary.trim() } : {}),
			},
		};
	}

	return {
		spawn,
		resume,
		recover,
		complete,
	};
}

export function registerWorkflowLifecycleTools(
	pi: ExtensionAPI,
	deps: WorkflowToolDependencies,
	options: { shouldRegister?: (name: string) => boolean } = {},
): void {
	const lifecycle = createWorkflowLifecycleTools(pi, deps);
	const shouldRegister = options.shouldRegister ?? (() => true);

	if (shouldRegister("workflow_spawn")) {
		pi.registerTool({
			name: "workflow_spawn",
			label: "Workflow Spawn",
			description:
				"Launch a fresh manifest role for the active persisted workflow run. "
				+ "The tool validates the run token, explicit role, typed data, model assignment, agent, and repository write policy. "
				+ ASYNC_WORKFLOW_TOOL_CONTRACT,
			promptSnippet:
				"Launch a fresh role in the active workflow using its explicit run and role IDs.",
			parameters: WorkflowSpawnParams,
			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				try {
					return await lifecycle.spawn(params, ctx as WorkflowToolExecutionContext);
				} catch (error) {
					return errorResult(error);
				}
			},
		});
	}

	if (shouldRegister("workflow_resume")) {
		pi.registerTool({
			name: "workflow_resume",
			label: "Workflow Resume",
			description:
				"Resume the current session for an explicit manifest role in the active persisted workflow run. "
				+ "The caller does not pass a session path; the runtime resolves it and preserves history across fresh rollovers. "
				+ ASYNC_WORKFLOW_TOOL_CONTRACT,
			promptSnippet:
				"Resume the current session for an explicit role in the active workflow.",
			parameters: WorkflowResumeParams,
			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				try {
					return await lifecycle.resume(params, ctx as WorkflowToolExecutionContext);
				} catch (error) {
					return errorResult(error);
				}
			},
		});
	}

	if (shouldRegister("workflow_recover")) {
		pi.registerTool({
			name: "workflow_recover",
			label: "Workflow Recover",
			description:
				"Recover the current session for an explicit workflow role after quota exhaustion or exhausted provider retries. "
				+ "The runtime resolves the session, uses the manifest role label and handoff data, opens the shared model/context gates, "
				+ "and stores successful assignment overrides only in the active run. "
				+ ASYNC_WORKFLOW_TOOL_CONTRACT,
			promptSnippet:
				"Recover a failed active-workflow role after an eligible provider failure.",
			parameters: WorkflowRecoverParams,
			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				try {
					return await lifecycle.recover(params, ctx as WorkflowToolExecutionContext);
				} catch (error) {
					return errorResult(error);
				}
			},
		});
	}

	if (shouldRegister("workflow_complete")) {
		pi.registerTool({
			name: "workflow_complete",
			label: "Workflow Complete",
			description:
				"Persist the active workflow run as completed or aborted, retain its data and role-session history for audit, and invalidate the run token.",
			promptSnippet:
				"Explicitly complete or abort the active persisted workflow run.",
			parameters: WorkflowCompleteParams,
			async execute(_toolCallId, params) {
				try {
					return lifecycle.complete(params);
				} catch (error) {
					return errorResult(error);
				}
			},
		});
	}
}
