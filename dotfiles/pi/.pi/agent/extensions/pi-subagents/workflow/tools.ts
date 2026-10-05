import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
	type LaunchProfileWorkflowMetadata,
	type ModelSelection,
	normalizeLaunchProfileWorkflowMetadata,
} from "../execution/launch-profile.ts";
import { pickModelSelection, resolveModelPolicy } from "../profiles/model-picker.ts";
import {
	WorkflowRoleCleanupRequiredError, type WorkflowRoleOwnership,
	type WorkflowRoleLease, type WorkflowEventClient,
} from "../adapters/workflow-client.ts";
import type { WorkflowOwner, WorkflowRoleResult } from "../adapters/workflow-contract.ts";
import type {
	LaunchContext,
	SubagentToolResult,
} from "../execution/types.ts";
import { buildWorkflowRolloverHandoffForRun } from "./handoff.ts";
import {
	RECOVERY_SELECT_MODEL,
	RECOVERY_STOP,
	buildWorkflowRecoveryLabels,
	buildWorkflowRecoveryMessage,
	classifyProviderFailure,
	shouldOpenRecoveryGate,
} from "./recovery.ts";
import {
	abortWorkflowRun,
	assertNoPendingWorkflowGate,
	assertWorkflowRoleEnabled,
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
	WorkflowPresetAssignment,
} from "./presets.ts";
import { isWorkflowRoleSkipAssignment } from "./types.ts";
import type {
	WorkflowRoleAssignment,
	WorkflowRoleDefinition,
	WorkflowRunSnapshot,
} from "./types.ts";

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

function workflowRoleResultContent(
	role: WorkflowRoleDefinition,
	status: WorkflowRoleResult["status"],
	message: string,
): string {
	return `Workflow role "${role.label}" (${role.id}) ${status}. Result:\n${message}`;
}

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

export interface WorkflowToolDependencies {
	state: WorkflowToolStateStore;
	eventExecution?: WorkflowEventClient;
}

interface WorkflowToolExecutionContext extends ExtensionContext {
	sessionManager: ExtensionContext["sessionManager"] & LaunchContext["sessionManager"];
}

function formatDiagnostics(
	diagnostics: readonly { path: string; message: string }[],
): string {
	return diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("\n");
}

function cloneSelection(selection: WorkflowRoleAssignment | undefined): ModelSelection | undefined {
	if (!selection || isWorkflowRoleSkipAssignment(selection)) return undefined;
	return {
		provider: selection.provider,
		model: selection.model,
		...(selection.thinking ? { thinking: selection.thinking } : {}),
	};
}

function startupAssignments(
	assignments: Readonly<Record<string, WorkflowRoleAssignment>> | undefined,
): WorkflowPresetRoles | undefined {
	if (!assignments) return undefined;
	const normalized: Record<string, WorkflowPresetAssignment> = {};
	for (const [roleId, selection] of Object.entries(assignments)) {
		if (isWorkflowRoleSkipAssignment(selection)) {
			normalized[roleId] = { skip: true };
			continue;
		}
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
	if (!Object.hasOwn(snapshot.definition.roleById, roleId)) {
		throw new Error(
			`Workflow "${snapshot.workflowId}" has no role "${roleId}". Valid roles: ${snapshot.definition.roleIds.join(", ")}.`,
		);
	}
	assertWorkflowRoleEnabled(snapshot, roleId);
	assertNoPendingWorkflowGate(snapshot);
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
	const sessionPath = (Object.hasOwn(snapshot.roleSessions, roleId)
		? snapshot.roleSessions[roleId]?.current : undefined)
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
	const original = cloneSelection(
		snapshot.originalAssignments && Object.hasOwn(snapshot.originalAssignments, roleId)
			? snapshot.originalAssignments[roleId] : undefined,
	);
	const current = cloneSelection(
		snapshot.currentAssignments && Object.hasOwn(snapshot.currentAssignments, roleId)
			? snapshot.currentAssignments[roleId] : undefined,
	);
	if (current && (!original || !sameSelection(original, current))) return "recovery";
	return snapshot.assignmentSource;
}

function workflowMetadataForRole(
	snapshot: WorkflowRunSnapshot,
	roleId: string,
	currentDefault?: ModelSelection,
): LaunchProfileWorkflowMetadata {
	const originalDefault = cloneSelection(
		snapshot.originalAssignments && Object.hasOwn(snapshot.originalAssignments, roleId)
			? snapshot.originalAssignments[roleId] : undefined,
	);
	const storedCurrent = cloneSelection(
		snapshot.currentAssignments && Object.hasOwn(snapshot.currentAssignments, roleId)
			? snapshot.currentAssignments[roleId] : undefined,
	);
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
		status: "completed" | "failed" | "running" | "interrupted";
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

function errorResult(error: unknown): SubagentToolResult {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ type: "text", text: `Error: ${message}` }],
		details: { error: "workflow lifecycle rejected", message },
		isError: true,
	};
}

export function createWorkflowLifecycleTools(
	pi: ExtensionAPI,
	deps: WorkflowToolDependencies,
) {
	let branchGeneration = 0;
	let navigating = false;
	let stoppingRoles = 0;
	let eventDeliveryFailed = false;
	const eventChildren = new Set<WorkflowRoleOwnership>();
	const pendingLaunches = new Set<Promise<void>>();

	async function stopBeforeTree(): Promise<void> {
		// A restored branch can contain the exact same run/role/session IDs.
		// Invalidate callbacks before stopping children or restoring snapshots.
		branchGeneration++;
		navigating = true;
		await stopRoles();
		// Other before-tree handlers can still cancel navigation after this returns.
	}

	async function stopRoles(): Promise<void> {
		await Promise.allSettled([...pendingLaunches]);
		for (const lease of eventChildren) {
			await lease.stop();
			eventChildren.delete(lease);
		}
		const active = getActiveWorkflowRun(deps.state.getState());
		if (active?.activeLaunch?.status === "starting" || active?.activeLaunch?.status === "running") {
			// Navigation can still be cancelled by another handler after we stop.
			deps.state.commit(setWorkflowRunActiveLaunch(deps.state.getState(), active.runId, {
				...active.activeLaunch,
				status: "interrupted",
			}));
		}
	}

	function releaseNavigationWhenIdle(ctx: Pick<ExtensionContext, "isIdle">): void {
		// Pi has no tree-cancelled event. Its public idle predicate remains false
		// throughout navigateTree(), including cancellation/error unwinding.
		// Release at the next idle prompt/settled boundary, never on signal abort
		// or session_tree (both can precede navigation's actual completion).
		// A failed strict stop must be retried before launches are allowed again.
		if (navigating && stoppingRoles === 0 && pendingLaunches.size === 0 && eventChildren.size === 0 && ctx.isIdle()) {
			navigating = false;
		}
	}
	async function stopOwnedRoles(): Promise<void> {
		const generation = ++branchGeneration;
		stoppingRoles++;
		try {
			await stopRoles();
			assertOwned(() => generation === branchGeneration);
		}
		finally { stoppingRoles--; }
	}

	async function trackLaunch<T>(operation: () => Promise<T>): Promise<T> {
		if (eventDeliveryFailed) throw new Error("Workflow result handling failed; reload and explicitly resume the saved run.");
		if (navigating || stoppingRoles > 0) throw new Error("Workflow branch navigation is stopping its roles; retry after navigation.");
		if (pendingLaunches.size > 0) throw new Error("Workflow role launch is already in progress; only one role may own the active run.");
		if (eventChildren.size > 0) throw new Error("Workflow role still owns a child; stop or resume only after confirmed cleanup.");
		// Reserve the run before invoking dependencies, not just before awaiting
		// acknowledgement. Preflight, pickers, and even synchronous callbacks can
		// admit another tool call. Navigation must also see this reservation.
		let release!: () => void;
		const pending = new Promise<void>((resolve) => { release = resolve; });
		pendingLaunches.add(pending);
		try {
			return await operation();
		} finally {
			// A launched child retains ownership after this reservation ends.
			pendingLaunches.delete(pending);
			release();
		}
	}

	function assertOwned(isOwned: () => boolean): void {
		if (!isOwned()) throw new Error("Workflow role interrupted by branch navigation; saved files are preserved.");
	}
	function assertCallActive(signal?: AbortSignal): void {
		if (signal?.aborted) throw new Error("Workflow role call cancelled; saved files are preserved.");
	}

	function reportEventFailure(error: unknown, isOwned: () => boolean, ctx: WorkflowToolExecutionContext): void {
		// This is the terminal promise consumer. Never retry a failed append or
		// publish state outside the durable commit path, including for diagnostics.
		try {
			if (!isOwned()) return;
			eventDeliveryFailed = true;
			const message = `Workflow result handling failed: ${String(error)}. Saved state was preserved; reload and explicitly resume the run.`;
			try { ctx.ui.notify(message, "error"); }
			catch { console.error(message); }
		} catch {
			// Neither UI nor the last-resort diagnostic is guaranteed to be available.
		}
	}

	function recordEventLaunchFailure(
		error: unknown, isOwned: () => boolean,
		launch: { runId: string; roleId: string; sessionPath?: string },
	): void {
		if (error instanceof WorkflowRoleCleanupRequiredError) {
			// Retain before persisting or checking branch ownership: navigation
			// must stop this child even if it began while the request was pending.
			eventChildren.add(error.ownership);
			if (isOwned()) deps.state.commit(setWorkflowRunActiveLaunch(deps.state.getState(), launch.runId, {
				roleId: launch.roleId, sessionPath: error.sessionPath ?? launch.sessionPath, status: "interrupted",
			}));
		} else if (isOwned()) finishLaunch(deps, { ...launch, status: "failed" });
	}

	async function spawn(
		params: {
			runId: string;
			role: string;
			task: string;
			data?: Record<string, string>;
		},
		ctx: WorkflowToolExecutionContext,
		signal?: AbortSignal,
	): Promise<SubagentToolResult> {
		assertCallActive(signal);
		const generation = branchGeneration;
		const isOwned = () => generation === branchGeneration;
		let snapshot = activeRunForToken(deps.state.getState(), params.runId);
		const role = roleForRun(snapshot, params.role);
		snapshot = mergeDataUpdates(deps, params.runId, params.data);

		const client = deps.eventExecution;
		if (!client) throw new Error("Workflow execution provider is unavailable");
		const eventOwner: WorkflowOwner = {
			sessionId: ctx.sessionManager.getSessionId(),
			runId: snapshot.runId,
			roleId: role.id,
			ownershipId: randomUUID(),
		};
		if (client.provider.providerId !== (snapshot.providerId ?? "pi-agent-teams")) {
			throw new Error("Workflow provider binding mismatch.");
		}
		await client.preflight(eventOwner, [role.agent], { signal });
		assertCallActive(signal);
		assertOwned(isOwned);
		if (!ctx.sessionManager.getSessionFile()) return {
			content: [{ type: "text", text: "Error: workflow roles require a persistent parent session." }],
			details: { error: "no session file" },
			isError: true,
		};

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
		assertCallActive(signal);
		assertOwned(isOwned);
		const metadata = workflowMetadataForRole(
			snapshot,
			role.id,
			resolvedModel.selection,
		);

		recordLaunchStarting(deps, snapshot, role.id);
		const owner = eventOwner!;
		let lease: WorkflowRoleLease;
		try {
			lease = await client.launch(owner, {
				agentId: role.agent, name: role.label, task: params.task,
				model: resolvedModel.selection, workflow: metadata,
				repositoryRoot: snapshot.projectRoot,
			}, {
				signal,
				onPing: (ping, facts) => {
					if (!isOwned()) return;
					pi.sendMessage({
						customType: "subagent_ping", content: ping.message, display: true,
						details: workflowDetails(snapshot, role, {
							name: role.label, agent: role.agent, sessionFile: facts?.sessionPath,
						}),
					}, { triggerTurn: true, deliverAs: "steer" });
				},
			});
		} catch (error) {
			recordEventLaunchFailure(error, isOwned, { runId: snapshot.runId, roleId: role.id });
			throw error;
		}
		eventChildren.add(lease);
		const sessionPath = lease.facts.sessionPath;
		void lease.result.then((result) => {
			if (!lease.active) eventChildren.delete(lease);
			if (!isOwned()) return;
			finishLaunch(deps, {
				runId: snapshot.runId, roleId: role.id, sessionPath,
				status: result.stopRequired ? "running" : result.status === "completed" ? "completed" : "failed",
			});
			pi.sendMessage({
				customType: "subagent_result",
				content: workflowRoleResultContent(role, result.status, result.message),
				display: true,
				details: workflowDetails(snapshot, role, {
					name: role.label, agent: role.agent, sessionFile: sessionPath,
					status: result.status,
					failureKind: classifyProviderFailure(result.message),
					...(result.status === "failed" ? { errorMessage: result.message } : {}),
				}),
			}, { triggerTurn: true, deliverAs: "steer" });
		}, (error: unknown) => {
			// A lost provider or unconfirmed delivery must not advance to the next role.
			if (!isOwned()) return;
			finishLaunch(deps, { runId: snapshot.runId, roleId: role.id, sessionPath, status: "interrupted" });
			pi.sendMessage({
				customType: "subagent_result",
				content: `Workflow role "${role.label}" error: ${error instanceof Error ? error.message : String(error)}`,
				display: true,
				details: workflowDetails(snapshot, role, { sessionFile: sessionPath, error: String(error) }),
			}, { triggerTurn: true, deliverAs: "steer" });
		}).catch((error: unknown) => reportEventFailure(error, isOwned, ctx));
		// Navigation must see and consume this lease before the pending spawn
		// settles, even if ownership changed while awaiting acknowledgement.
		assertOwned(isOwned);
		recordLaunchedSession(deps, snapshot.runId, role.id, sessionPath);
		return {
			content: [{ type: "text", text: `Workflow role "${role.label}" launched in the background. The harness will deliver its result automatically; do not poll.` }],
			details: workflowDetails(snapshot, role, {
				name: role.label, status: "started", sessionFile: sessionPath,
			}),
		};
	}

	async function savedEvent(
		operation: "resume" | "recover",
		params: { runId: string; role: string; message?: string; model?: string; failure?: string; data?: Record<string, string> },
		ctx: WorkflowToolExecutionContext,
		signal?: AbortSignal,
	): Promise<SubagentToolResult> {
		const epoch = branchGeneration;
		const isOwned = () => epoch === branchGeneration && getActiveWorkflowRun(deps.state.getState())?.runId === params.runId;
		let snapshot = activeRunForToken(deps.state.getState(), params.runId);
		const role = roleForRun(snapshot, params.role);
		const client = deps.eventExecution;
		if (!client) throw new Error("Workflow provider unavailable; role session preserved.");
		if (client.provider.providerId !== (snapshot.providerId ?? "pi-agent-teams")) throw new Error("Workflow provider binding mismatch.");
		const sessionPath = currentRoleSession(snapshot, role.id);
		const owner: WorkflowOwner = { sessionId: ctx.sessionManager.getSessionId(), runId: params.runId, roleId: role.id, ownershipId: randomUUID() };
		const profiles = await client.preflight(owner, [role.agent], { signal });
		const profile = profiles.find((item) => item.agentId === role.agent);
		if (!profile) throw new Error("Saved workflow profile unavailable.");
		const baseRequest = {
			sessionPath, expected: { agentId: role.agent, profileHash: profile.hash },
			workflow: workflowMetadataForRole(snapshot, role.id), repositoryRoot: snapshot.projectRoot,
		};
		const facts = await client.inspect(owner, baseRequest, { signal });
		assertCallActive(signal);
		assertOwned(isOwned);
		let selected: ModelSelection | undefined;
		if (operation === "recover") {
			const kind = classifyProviderFailure(params.failure ?? "");
			if (!shouldOpenRecoveryGate(kind)) throw new Error(`Failure "${kind}" is not eligible for workflow recovery.`);
			if (!ctx.hasUI) throw new Error("Workflow recovery needs interactive UI.");
			const labels = buildWorkflowRecoveryLabels(snapshot, role.id);
			const choice = await ctx.ui.select(labels.gatePrompt, [RECOVERY_SELECT_MODEL, RECOVERY_STOP]);
			assertCallActive(signal);
			assertOwned(isOwned);
			if (choice !== RECOVERY_SELECT_MODEL) return { content: [{ type: "text", text: "Recovery cancelled; saved role preserved." }], details: { status: "cancelled" } };
			const picked = await pickModelSelection(ctx, { contextTokens: facts.context.tokens, subject: role.label });
			assertCallActive(signal);
			assertOwned(isOwned);
			if (!picked) return { content: [{ type: "text", text: "Recovery cancelled; saved role preserved." }], details: { status: "cancelled" } };
			selected = picked.selection;
		} else if (params.model && params.model !== "previous") {
			const resolved = await resolveModelPolicy(params.model, ctx, { mode: "resume", contextTokens: facts.context.tokens });
			assertCallActive(signal);
			if (resolved.source === "legacy") throw new Error("Workflow resume model unavailable.");
			selected = resolved.selection;
			assertOwned(isOwned);
		}
		snapshot = mergeDataUpdates(deps, params.runId, params.data);
		const workflow = {
			...workflowMetadataForRole(snapshot, role.id, selected ?? facts.model as ModelSelection),
			...(operation === "recover" ? { assignmentSource: "recovery" as const } : {}),
		};
		const request = {
			...baseRequest, workflow,
			expected: { ...baseRequest.expected, model: facts.model, contextTokens: facts.context.tokens },
			...(selected ? { model: selected } : {}),
			name: role.label, allowRollover: true,
			allowUserModelSelection: ctx.hasUI,
			message: operation === "recover"
				? buildWorkflowRecoveryMessage({ snapshot, roleId: role.id, userMessage: params.message })
				: params.message,
			rolloverMessage: buildWorkflowRolloverHandoffForRun({ snapshot, roleId: role.id, userMessage: params.message }),
		};
		recordLaunchStarting(deps, snapshot, role.id, sessionPath);
		let lease: WorkflowRoleLease;
		try {
			const onPing = (ping: { message: string }) => {
				if (isOwned()) pi.sendMessage({ customType: "subagent_ping", content: ping.message, display: true },
					{ triggerTurn: true, deliverAs: "steer" });
			};
			lease = operation === "recover"
				? await client.recover(owner, { ...request, failure: params.failure!, model: selected! }, { onPing, signal })
				: await client.resume(owner, request, { onPing, signal });
			eventChildren.add(lease);
			// Attach before persistence: shutdown must always be able to cancel it.
			void lease.result.then((result) => {
				if (!lease.active) eventChildren.delete(lease);
				if (!isOwned()) return;
				finishLaunch(deps, {
					runId: snapshot.runId, roleId: role.id, sessionPath: lease.facts.sessionPath,
					status: result.stopRequired ? "running" : result.status === "completed" ? "completed" : "failed",
				});
				if (operation === "recover" && result.successfulResponse === true
					&& result.status === "completed" && !result.stopRequired) {
					deps.state.commit(overrideWorkflowRunAssignment(
						deps.state.getState(), snapshot.runId, role.id, lease.facts.model as ModelSelection,
					));
				}
				pi.sendMessage({
					customType: "subagent_result",
					content: workflowRoleResultContent(role, result.status, result.message),
					display: true,
					details: workflowDetails(snapshot, role, {
						sessionFile: lease.facts.sessionPath, status: result.status,
						failureKind: classifyProviderFailure(result.message),
						...(result.status === "failed" ? { errorMessage: result.message } : {}),
					}),
				}, { triggerTurn: true, deliverAs: "steer" });
			}, (error: unknown) => {
				if (!isOwned()) return;
				deps.state.commit(setWorkflowRunActiveLaunch(deps.state.getState(), snapshot.runId, {
					roleId: role.id, sessionPath: lease.facts.sessionPath, status: "interrupted",
				}));
				pi.sendMessage({ customType: "subagent_result", content: `Workflow provider interrupted: ${String(error)}. Explicit recovery after reload is required.`, display: true },
					{ triggerTurn: true, deliverAs: "steer" });
			}).catch((error: unknown) => reportEventFailure(error, isOwned, ctx));
			assertOwned(isOwned);
			recordLaunchedSession(deps, snapshot.runId, role.id, lease.facts.sessionPath);
		} catch (error) {
			recordEventLaunchFailure(error, isOwned, { runId: snapshot.runId, roleId: role.id, sessionPath });
			throw error;
		}
		return {
			content: [{ type: "text", text: `Workflow role "${role.label}" ${operation} started. Results arrive automatically.` }],
			details: { ...workflowDetails(snapshot, role), status: "started", sessionFile: lease.facts.sessionPath, rollover: lease.facts.replacement ? "fresh" : undefined },
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
		signal?: AbortSignal,
	): Promise<SubagentToolResult> {
		assertCallActive(signal);
		return savedEvent("resume", params, ctx, signal);
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
		signal?: AbortSignal,
	): Promise<SubagentToolResult> {
		assertCallActive(signal);
		return savedEvent("recover", params, ctx, signal);
	}

	async function complete(params: {
		runId: string;
		status: "completed" | "aborted";
		summary?: string;
	}): Promise<SubagentToolResult> {
		const snapshot = activeRunForToken(deps.state.getState(), params.runId);
		await stopOwnedRoles();
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
		stopBeforeTree,
		stopOwnedRoles,
		hasOwnedRole: () => eventDeliveryFailed || pendingLaunches.size > 0 || eventChildren.size > 0,
		endSession() {
			branchGeneration++;
			for (const lease of eventChildren) lease.dispose();
			eventChildren.clear();
			navigating = false;
			eventDeliveryFailed = false;
		},
		releaseNavigationWhenIdle,
		spawn: (...args: Parameters<typeof spawn>) => trackLaunch(() => spawn(...args)),
		resume: (...args: Parameters<typeof resume>) => trackLaunch(() => resume(...args)),
		recover: (...args: Parameters<typeof recover>) => trackLaunch(() => recover(...args)),
		complete,
	};
}

export function registerWorkflowLifecycleTools(
	pi: ExtensionAPI,
	deps: WorkflowToolDependencies,
	options: { shouldRegister?: (name: string) => boolean } = {},
) {
	const lifecycle = createWorkflowLifecycleTools(pi, deps);
	const shouldRegister = options.shouldRegister ?? (() => true);
	pi.on("input", (_event, ctx) => {
		// Pi starts the run before before_agent_start; input is the earlier idle
		// boundary. Completion deliveries during tree work are not user input.
		lifecycle.releaseNavigationWhenIdle(ctx);
		return { action: "continue" as const };
	});
	pi.on("before_agent_start", (_event, ctx) => lifecycle.releaseNavigationWhenIdle(ctx));
	pi.on("agent_settled", (_event, ctx) => lifecycle.releaseNavigationWhenIdle(ctx));

	if (shouldRegister("workflow_spawn")) {
		pi.registerTool({
			name: "workflow_spawn",
			exposure: "model-only",
			executionMode: "sequential",
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
					return await lifecycle.spawn(params, ctx as WorkflowToolExecutionContext, _signal);
				} catch (error) {
					return errorResult(error);
				}
			},
		});
	}

	if (shouldRegister("workflow_resume")) {
		pi.registerTool({
			name: "workflow_resume",
			exposure: "model-only",
			executionMode: "sequential",
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
					return await lifecycle.resume(params, ctx as WorkflowToolExecutionContext, _signal);
				} catch (error) {
					return errorResult(error);
				}
			},
		});
	}

	if (shouldRegister("workflow_recover")) {
		pi.registerTool({
			name: "workflow_recover",
			exposure: "model-only",
			executionMode: "sequential",
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
					return await lifecycle.recover(params, ctx as WorkflowToolExecutionContext, _signal);
				} catch (error) {
					return errorResult(error);
				}
			},
		});
	}

	if (shouldRegister("workflow_complete")) {
		pi.registerTool({
			name: "workflow_complete",
			exposure: "model-only",
			executionMode: "sequential",
			label: "Workflow Complete",
			description:
				"Persist the active workflow run as completed or aborted, retain its data and role-session history for audit, and invalidate the run token.",
			promptSnippet:
				"Explicitly complete or abort the active persisted workflow run.",
			parameters: WorkflowCompleteParams,
			async execute(_toolCallId, params) {
				try {
					return await lifecycle.complete(params);
				} catch (error) {
					return errorResult(error);
				}
			},
		});
	}
	return lifecycle;
}
