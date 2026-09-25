/** The tmux execution adapter. Workflow policy and session state stay with the coordinator. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	WORKFLOW_PROVIDER_CAPABILITIES,
	WORKFLOW_PROVIDER_CANCEL_CHANNEL,
	WORKFLOW_PROVIDER_DELIVERY_CHANNEL,
	WORKFLOW_PROVIDER_DISCOVER_CHANNEL,
	WORKFLOW_PROVIDER_REQUEST_CHANNEL,
	WORKFLOW_PROVIDER_VERSION,
	WorkflowProviderCleanupRequiredError,
	type WorkflowEventBus,
	type WorkflowOwner,
	type WorkflowProvider,
	type WorkflowProviderRequest,
	type WorkflowRoleFacts,
} from "../workflow-provider/contract.ts";
import { estimateSavedSessionContext } from "./context-fit.ts";
import {
	hashText, normalizeLaunchProfileWorkflowMetadata, readLaunchProfile, updateLaunchProfile,
	THINKING_LEVELS, type LaunchProfile, type LaunchProfileWorkflowMetadata, type ModelSelection,
} from "./launch-profile.ts";
import {
	captureRepoBoundarySnapshot, evaluateRepoBoundarySnapshot,
	type RepoBoundaryDefinition, type RepoBoundarySnapshot,
} from "../workflow-provider/repo-boundary.ts";
import { classifyProviderFailure } from "../workflow-provider/failure.ts";
import type {
	LaunchContext, ResumeLifecycleContext, RunningSubagent, SubagentResult,
	createSubagentExecutionServices,
} from "./subagent-services.ts";

export const TMUX_WORKFLOW_PROVIDER_ID = "pi-tmux-subagents";
type Services = Pick<ReturnType<typeof createSubagentExecutionServices>,
	"launchSubagent" | "watchSubagent" | "stopSubagent" | "executeSubagentResume">;
type Evidence = { changedFiles: string[]; manualReviewReason?: string };
type EvidenceBaseline = RepoBoundarySnapshot | { readonly changedFiles: readonly string[] };
type ProfileIdentity = { agentId: string; path: string; hash: string; roleBodyHash: string };
type Payload = {
	agentId?: string;
	name?: string;
	task?: string;
	sessionPath?: string;
	message?: string;
	rolloverMessage?: string;
	model?: { provider: string; model: string; thinking?: string };
	workflow?: LaunchProfileWorkflowMetadata;
	repositoryRoot?: string;
	repositoryBoundary?: RepoBoundaryDefinition;
	allowRollover?: boolean;
	allowUserModelSelection?: boolean;
	failure?: string;
	expected?: { agentId: string; profileHash: string; model?: { provider: string; model: string; thinking?: string }; contextTokens?: number };
};

export interface TmuxWorkflowProviderDependencies {
	events: WorkflowEventBus;
	sessionId: string;
	/** All children abstain, even when their own Pi event bus is visible. */
	env?: { PI_SUBAGENT_ID?: string; PI_SUBAGENT_SESSION?: string };
	isAvailable(): boolean;
	resolveProfile(agentId: string): ProfileIdentity | null;
	readProfile(sessionPath: string): LaunchProfile | null;
	updateProfile(sessionPath: string, workflow: LaunchProfileWorkflowMetadata): void;
	/** Record only a selection that the resume service confirmed it launched. */
	recordLaunchedModel(sessionPath: string, selection: ModelSelection): void;
	estimateContext(sessionPath: string): { tokens: number; source: string };
	captureEvidence(root: string, definition?: RepoBoundaryDefinition): EvidenceBaseline;
	finishEvidence(snapshot: unknown): Evidence;
	services: Services;
	ctx: LaunchContext;
	pi: Pick<ExtensionAPI, "sendMessage">;
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}
function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
function sameOwner(a: WorkflowOwner, b: WorkflowOwner): boolean {
	return a.sessionId === b.sessionId && a.runId === b.runId && a.roleId === b.roleId && a.ownershipId === b.ownershipId;
}
function validWorkflow(value: unknown, owner: WorkflowOwner): LaunchProfileWorkflowMetadata {
	if (!object(value) || value.runId !== owner.runId || value.roleId !== owner.roleId) {
		throw new Error("Workflow role ownership metadata mismatch");
	}
	// SAFETY: the parsed record has already passed the structural checks above.
	const normalized = normalizeLaunchProfileWorkflowMetadata(value as unknown as LaunchProfileWorkflowMetadata);
	if (!isDeepStrictEqual(normalized, value)) throw new Error("Invalid workflow metadata");
	return normalized;
}

/** Resolve the actual persisted sidecar, never facts asserted by a caller. */
function checkedFacts(
	deps: TmuxWorkflowProviderDependencies,
	path: string,
	agent: ProfileIdentity,
	workflow: LaunchProfileWorkflowMetadata,
	expected?: Payload["expected"],
	launch = false,
): WorkflowRoleFacts {
	const profile = deps.readProfile(path);
	if (!profile || !isDeepStrictEqual(profile.workflow, workflow)
		|| profile.stable.agentName !== agent.agentId
		|| profile.stable.roleBodyHash !== agent.roleBodyHash
		|| (expected && (expected.agentId !== agent.agentId || expected.profileHash !== agent.hash))) {
		throw new Error("Workflow session or agent profile identity mismatch");
	}
	const selection = profile.runtime.lastModel ?? profile.runtime.originalModel;
	if (!selection || !text(selection.provider) || !text(selection.model)) {
		throw new Error("Workflow model facts unavailable");
	}
	if (expected?.model && !isDeepStrictEqual(selection, expected.model)) {
		throw new Error("Workflow saved model mismatch");
	}
	const context = launch ? { tokens: 0, source: "new-session" } : deps.estimateContext(path);
	if (!Number.isFinite(context.tokens) || context.tokens < 0 || !text(context.source)
		|| (expected?.contextTokens !== undefined && context.tokens !== expected.contextTokens)) {
		throw new Error("Workflow context facts mismatch or unavailable");
	}
	return {
		sessionPath: path,
		profile: { agentId: agent.agentId, path: agent.path, hash: agent.hash },
		model: selection,
		context,
		metadataConfirmed: true,
	};
}

const REGISTRATION_KEY = Symbol.for("pi-tmux-subagents/workflow-provider-registration");
type Claim = { events: WorkflowEventBus; generation: string; detach(): void };
type Claims = Record<symbol, Claim | undefined>;
// SAFETY: this global slot stores only the claim shape declared above.
const claims = globalThis as unknown as Claims;
const generation = randomUUID();

/**
 * Attach once per root session. A module reload revokes the old incarnation;
 * duplicate registration in the same incarnation is refused.
 */
export function attachTmuxWorkflowProvider(deps: TmuxWorkflowProviderDependencies): {
	identity: WorkflowProvider;
	detach(): void;
} | null {
	if (deps.env?.PI_SUBAGENT_ID || deps.env?.PI_SUBAGENT_SESSION) return null;
	if (!text(deps.sessionId) || !deps.isAvailable()) return null;
	const previous = claims[REGISTRATION_KEY];
	if (previous?.events === deps.events && previous.generation === generation) return null;
	previous?.detach();
	const identity: WorkflowProvider = {
		providerId: TMUX_WORKFLOW_PROVIDER_ID, instanceId: randomUUID(),
		version: WORKFLOW_PROVIDER_VERSION, ready: true,
		capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
	};
	const active = new Map<string, { owner: WorkflowOwner; running: RunningSubagent; controller: AbortController; cleanupRequired?: boolean }>();
	const pending = new Map<string, {
		controller: AbortController; owner: WorkflowOwner;
		operation: WorkflowProviderRequest["operation"]; settled: Promise<void>;
	}>();
	const unsubs: Array<() => void> = [];
	let closed = false;
	let lost = false;
	const live = () => {
		if (!deps.isAvailable()) lost = true;
		return !closed && !lost;
	};

	function delivery(request: WorkflowProviderRequest, kind: "ping" | "result", value: unknown) {
		// A watcher may settle before its launch acknowledgement is consumed.
		// Defer delivery to the next turn so the coordinator can subscribe.
		setTimeout(() => {
			if (!live()) return;
			deps.events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
				requestId: request.requestId, providerId: identity.providerId, instanceId: identity.instanceId,
				owner: request.owner, kind, ...(kind === "ping" ? value as object : { result: value }),
			});
		}, 0);
	}
	function finish(request: WorkflowProviderRequest, running: RunningSubagent, baseline: unknown, result: SubagentResult, successfulResponse = false) {
		const owned = active.get(running.sessionFile);
		if (!owned || owned.cleanupRequired || !sameOwner(owned.owner, request.owner) || owned.running !== running || !live()) return;
		let evidence: Evidence;
		try {
			evidence = deps.finishEvidence(baseline);
			if (!Array.isArray(evidence.changedFiles) || !evidence.changedFiles.every(text)) throw new Error("Invalid repository evidence");
		} catch (error) {
			evidence = { changedFiles: [], manualReviewReason: `Repository evidence unavailable: ${errorText(error)}` };
		}
		// A watcher may return after tmux refused to close the pane. Keep
		// ownership so tree navigation can retry a strict stop.
		if (running.surfaceClosed) active.delete(running.sessionFile);
		const message = result.errorMessage ?? result.error ?? result.summary;
		const status = evidence.manualReviewReason || result.exitCode !== 0 || result.errorMessage || result.ping
			? "failed" : "completed";
		if (result.ping) {
			delivery(request, "ping", {
				message: result.ping.message, changedFiles: [...evidence.changedFiles],
				...(evidence.manualReviewReason ? { manualReviewReason: evidence.manualReviewReason } : {}),
			});
		}
		delivery(request, "result", {
			sessionPath: running.sessionFile, status, message,
			changedFiles: [...evidence.changedFiles],
			...(successfulResponse && status === "completed" && !result.ping ? { successfulResponse: true } : {}),
			...(!running.surfaceClosed ? { stopRequired: true } : {}),
			...(evidence.manualReviewReason ? { manualReviewReason: evidence.manualReviewReason } : {}),
		});
	}
	function reply(request: WorkflowProviderRequest, ok: boolean, data?: unknown, error?: unknown) {
		if (closed) return;
		deps.events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
			requestId: request.requestId, providerId: identity.providerId,
			instanceId: identity.instanceId, owner: request.owner, ok,
			...(ok ? { data } : {
				error: error === undefined ? "Workflow provider unavailable" : errorText(error),
				...(error instanceof WorkflowProviderCleanupRequiredError
					? { cleanupRequired: { sessionPath: error.sessionPath } } : {}),
			}),
		});
	}
	function agentFor(id: unknown): ProfileIdentity {
		if (!text(id)) throw new Error("Workflow agent identity required");
		const resolved = deps.resolveProfile(id);
		if (!resolved || resolved.agentId !== id || !text(resolved.path)
			|| !/^[a-f0-9]{64}$/.test(resolved.hash)
			|| !/^[a-f0-9]{64}$/.test(resolved.roleBodyHash)) {
			throw new Error(`Workflow agent profile "${id}" unavailable`);
		}
		return resolved;
	}
	function repository(payload: Payload): EvidenceBaseline {
		if (!text(payload.repositoryRoot)) throw new Error("Workflow repository root required");
		if (payload.repositoryBoundary && (!Array.isArray(payload.repositoryBoundary.allowedRules)
			|| !Array.isArray(payload.repositoryBoundary.protectedRules))) throw new Error("Invalid repository boundary");
		return deps.captureEvidence(payload.repositoryRoot, payload.repositoryBoundary);
	}
	function saved(request: WorkflowProviderRequest, payload: Payload) {
		if (!text(payload.sessionPath) || !payload.expected || !text(payload.expected.agentId)
			|| !text(payload.expected.profileHash)) throw new Error("Expected saved session and profile identity required");
		const agent = agentFor(payload.expected.agentId);
		const workflow = validWorkflow(payload.workflow, request.owner);
		const stored = deps.readProfile(payload.sessionPath);
		if (!stored || !stored.workflow
			|| stored.workflow.workflowId !== workflow.workflowId
			|| stored.workflow.manifestHash !== workflow.manifestHash
			|| stored.workflow.skillHash !== workflow.skillHash
			|| stored.workflow.runId !== workflow.runId || stored.workflow.roleId !== workflow.roleId) {
			throw new Error("Workflow saved session identity mismatch");
		}
		if (payload.expected.profileHash !== agent.hash || stored.stable.agentName !== agent.agentId
			|| stored.stable.roleBodyHash !== agent.roleBodyHash) throw new Error("Workflow saved agent profile identity mismatch");
		// Confirm model/context against the old sidecar before changing its metadata.
		checkedFacts(deps, payload.sessionPath, agent, stored.workflow, payload.expected);
		return { agent, workflow };
	}
	function update(path: string, workflow: LaunchProfileWorkflowMetadata) {
		deps.updateProfile(path, workflow);
		if (!isDeepStrictEqual(deps.readProfile(path)?.workflow, workflow)) {
			throw new Error("Workflow metadata update was not confirmed by sidecar readback");
		}
	}
	function rejectLaunched(request: WorkflowProviderRequest, running: RunningSubagent, error: unknown): never {
		// Confirmation can fail before launch has registered an owner or watcher.
		if (!active.has(running.sessionFile)) {
			active.set(running.sessionFile, { owner: request.owner, running, controller: new AbortController() });
		}
		const held = active.get(running.sessionFile)!;
		const ownsChild = held.running === running && sameOwner(held.owner, request.owner);
		// No launch acknowledgement means no result consumer. Only a strict stop
		// may release this owner, even if its background watcher later settles.
		if (ownsChild) held.cleanupRequired = true;
		try { deps.services.stopSubagent(running); }
		catch (cleanupError) {
			throw new WorkflowProviderCleanupRequiredError(
				`${errorText(error)}; workflow cleanup failed: ${errorText(cleanupError)}`,
				running.sessionFile,
			);
		}
		if (ownsChild) {
			held.controller.abort();
			active.delete(running.sessionFile);
		}
		throw error;
	}
	async function handle(request: WorkflowProviderRequest, signal: AbortSignal): Promise<unknown> {
		if (!live()) throw new Error("Workflow provider unavailable");
		const payload = request.payload;
		if (!object(payload)) throw new Error("Invalid workflow provider payload");
		const p = payload as Payload;
		if (request.operation === "ping") return { alive: true };
		if (request.operation === "profiles") {
			if (!Array.isArray(payload.requiredAgents) || !payload.requiredAgents.every(text)) throw new Error("Required agents missing");
			return { profiles: payload.requiredAgents.map((id: string) => agentFor(id)).map(({ agentId, path, hash }) => ({ agentId, path, hash })) };
		}
		if (request.operation === "update-metadata") {
			const { workflow } = saved(request, p);
			update(p.sessionPath!, workflow);
			return { confirmed: true };
		}
		if (request.operation === "inspect") {
			const { agent } = saved(request, p);
			const stored = deps.readProfile(p.sessionPath!);
			return checkedFacts(deps, p.sessionPath!, agent, stored!.workflow!, p.expected);
		}
		if (request.operation === "stop") {
			if (p.sessionPath !== undefined && !text(p.sessionPath)) throw new Error("Invalid owned session path");
			// A timed-out launch may not have supplied its path yet. Cancel and
			// drain that owner's starts before confirming that no child remains.
			const starting = [...pending.values()].filter((entry) => sameOwner(entry.owner, request.owner)
				&& (entry.operation === "launch" || entry.operation === "resume" || entry.operation === "recover"));
			for (const entry of starting) entry.controller.abort();
			await Promise.all(starting.map((entry) => entry.settled));
			if (!live()) throw new Error("Workflow provider unavailable");
			const owned = [...active.entries()].filter(([path, held]) => sameOwner(held.owner, request.owner)
				&& (p.sessionPath === undefined || path === p.sessionPath));
			if (p.sessionPath !== undefined && owned.length === 0) throw new Error("Owned workflow role not found");
			for (const [path, held] of owned) {
				deps.services.stopSubagent(held.running); // throws on failed pane close
				held.controller.abort();
				active.delete(path);
			}
			return { stopped: true };
		}
		if (request.operation === "launch") {
			const agent = agentFor(p.agentId);
			const workflow = validWorkflow(p.workflow, request.owner);
			if (!text(p.task) || !text(p.name) || !p.model || !text(p.model.provider) || !text(p.model.model)
				|| (p.model.thinking !== undefined && !THINKING_LEVELS.includes(p.model.thinking as never))) {
				throw new Error("Workflow launch task or resolved model unavailable");
			}
			const baseline = repository(p);
			if (signal.aborted || !live()) throw new Error("Workflow launch cancelled");
			// Only the selected model and thinking are allowed; the model registry supplies the canonical model.
			const model = deps.ctx.modelRegistry?.getAvailable().find(
				(candidate) => candidate.provider === p.model!.provider && candidate.id === p.model!.model,
			);
			if (!model) throw new Error("Workflow selected model unavailable");
			const selection = { provider: p.model.provider, model: p.model.model,
				...(p.model.thinking ? { thinking: p.model.thinking as typeof THINKING_LEVELS[number] } : {}) };
			const running = await deps.services.launchSubagent(
				{ agent: agent.agentId, name: p.name, task: p.task }, deps.ctx,
				{ workflow, resolvedModel: { model, selection, argument: `${selection.provider}/${selection.model}${selection.thinking ? `:${selection.thinking}` : ""}`, source: "explicit" } },
			);
			try {
				if (signal.aborted || !live()) throw new Error("Workflow launch cancelled or provider lost");
				const facts = checkedFacts(deps, running.sessionFile, agent, workflow, undefined, true);
				if (!isDeepStrictEqual(facts.model, selection)) throw new Error("Workflow launch model mismatch");
				if (active.has(running.sessionFile)) throw new Error("Workflow role session already owned");
				const controller = new AbortController();
				active.set(running.sessionFile, { owner: request.owner, running, controller });
				void deps.services.watchSubagent(running, controller.signal)
					.then((result) => finish(request, running, baseline, result))
					.catch((error) => finish(request, running, baseline, {
						name: running.name, task: running.task, summary: errorText(error), error: errorText(error),
						sessionFile: running.sessionFile, exitCode: 1, elapsed: 0,
					}));
				return { ...facts, accepted: true };
			} catch (error) {
				return rejectLaunched(request, running, error);
			}
		}
		if (request.operation === "resume" || request.operation === "recover") {
			const { agent, workflow } = saved(request, p);
			if (p.model && (!text(p.model.provider) || !text(p.model.model)
				|| (p.model.thinking !== undefined && !THINKING_LEVELS.includes(p.model.thinking as never))
				|| !deps.ctx.modelRegistry?.getAvailable().some(
					(model) => model.provider === p.model!.provider && model.id === p.model!.model,
				))) throw new Error("Workflow replacement model unavailable");
			if (request.operation === "recover"
				&& (!text(p.failure) || classifyProviderFailure(p.failure) === "other" || !p.model)) {
				throw new Error("Workflow recovery requires an eligible failure and a selected replacement model");
			}
			const baseline = repository(p);
			if (active.has(p.sessionPath!)) throw new Error("Workflow role session already owned");
			if (signal.aborted || !live()) throw new Error("Workflow resume cancelled");
			update(p.sessionPath!, workflow);
			const facts = checkedFacts(deps, p.sessionPath!, agent, workflow, p.expected);
			let launched: RunningSubagent | undefined;
			let launchedSelection: ModelSelection | undefined;
			let successfulResponseModel: ModelSelection | undefined;
			let userSelectedModel = false;
			const lifecycle: ResumeLifecycleContext = {
				isOwned: () => !signal.aborted && live(),
				workflowMetadata: workflow,
				rolloverMessage: p.rolloverMessage,
				onLaunched: ({ running, sessionPath, selection, userSelectedModel: selectedByUser }) => {
					launched = running;
					launchedSelection = selection;
					userSelectedModel = selectedByUser === true && p.allowUserModelSelection === true;
					if (active.has(sessionPath)) throw new Error("Workflow role session already owned");
					active.set(sessionPath, { owner: request.owner, running, controller: new AbortController() });
				},
				onResult: ({ result, sessionPath }) => {
					if (launched && sessionPath === launched.sessionFile) finish(
						request, launched, baseline, result,
						!!successfulResponseModel && isDeepStrictEqual(successfulResponseModel, launchedSelection),
					);
				},
				onError: ({ message, sessionPath }) => {
					if (launched && sessionPath === launched.sessionFile) finish(request, launched, baseline, {
						name: launched.name, task: launched.task, summary: message, error: message, exitCode: 1, elapsed: 0,
					});
				},
			};
			// The existing resume watcher delivers subagent_result itself. Suppress only
			// those messages here: delivery belongs to the correlated event channel.
			const pi = { ...deps.pi, sendMessage(message: Parameters<ExtensionAPI["sendMessage"]>[0], options?: Parameters<ExtensionAPI["sendMessage"]>[1]) {
				if (message.customType !== "subagent_result" && message.customType !== "subagent_ping") deps.pi.sendMessage(message, options);
			} } as ExtensionAPI;
			try {
				const result = await deps.services.executeSubagentResume(
					pi, { sessionPath: p.sessionPath!, name: p.name ?? agent.agentId, message: p.message,
						model: p.model ? `${p.model.provider}/${p.model.model}${p.model.thinking ? `:${p.model.thinking}` : ""}` : "previous" },
					{ ...deps.ctx, pi } as LaunchContext & ExtensionContext,
					request.operation === "recover" ? {
						failure: {
							kind: classifyProviderFailure(p.failure!), message: p.failure!,
							provider: facts.model.provider, model: facts.model.model, recordedAt: new Date().toISOString(),
						},
						transformWorkflowMetadata: (stored, selection) => ({
							...stored, currentDefault: selection.selection, assignmentSource: "recovery",
						}),
						onSuccessfulResponse: (selection) => { successfulResponseModel = selection; },
					} : undefined, lifecycle,
				);
				if (signal.aborted || !live() || result.details.error || result.details.status !== "started" || !launched) {
					throw new Error(`Workflow resume not confirmed: ${String(result.details.message ?? result.details.error ?? "provider unavailable")}`);
				}
				const replacement = launched.sessionFile !== p.sessionPath;
				if (replacement) {
					if (p.allowRollover !== true
						|| deps.readProfile(p.sessionPath!)?.lineage?.rolledOverTo !== launched.sessionFile
						|| deps.readProfile(launched.sessionFile)?.lineage?.rolledOverFrom !== p.sessionPath) {
						throw new Error("Workflow rollover lineage not confirmed");
					}
				}
				if (p.model && !userSelectedModel && (!launchedSelection || !isDeepStrictEqual(launchedSelection, p.model))) {
					throw new Error("Workflow selected model was not confirmed by the launch service");
				}
				if (launchedSelection) deps.recordLaunchedModel(launched.sessionFile, launchedSelection);
				const finalWorkflow = request.operation === "recover" && userSelectedModel && launchedSelection
					? { ...workflow, currentDefault: launchedSelection, assignmentSource: "recovery" as const }
					: workflow;
				if (finalWorkflow !== workflow) update(launched.sessionFile, finalWorkflow);
				const resultFacts = checkedFacts(deps, launched.sessionFile, agent, finalWorkflow, undefined, replacement);
				if (launchedSelection && !isDeepStrictEqual(resultFacts.model, launchedSelection)) {
					throw new Error("Workflow launch selection not confirmed by sidecar");
				}
				if (p.model && !userSelectedModel && !isDeepStrictEqual(resultFacts.model, p.model)) {
					throw new Error("Workflow replacement model not confirmed by sidecar");
				}
				if (!replacement && !p.model && !userSelectedModel && !isDeepStrictEqual(resultFacts.model, facts.model)) {
					throw new Error("Workflow resume model facts mismatch");
				}
				return {
					...resultFacts,
					...(userSelectedModel ? { userSelectedModel: true as const } : {}),
					...(replacement ? { originalSessionPath: p.sessionPath, replacement: true as const } : {}),
				};
			} catch (error) {
				if (launched) return rejectLaunched(request, launched, error);
				throw error;
			}
		}
		throw new Error("Unsupported workflow provider operation");
	}
	unsubs.push(deps.events.on(WORKFLOW_PROVIDER_DISCOVER_CHANNEL, (value) => {
		if (!live() || !object(value) || !text(value.requestId) || value.version !== WORKFLOW_PROVIDER_VERSION) return;
		deps.events.emit(`${WORKFLOW_PROVIDER_DISCOVER_CHANNEL}:reply:${value.requestId}`, { requestId: value.requestId, ...identity });
	}));
	unsubs.push(deps.events.on(WORKFLOW_PROVIDER_CANCEL_CHANNEL, (value) => {
		if (!object(value) || value.providerId !== identity.providerId || value.instanceId !== identity.instanceId
			|| !text(value.requestId)) return;
		const inFlight = pending.get(value.requestId);
		if (inFlight && object(value.owner)) {
			// SAFETY: object(value.owner) establishes the record shape.
			const candidateOwner = value.owner as unknown as WorkflowOwner;
			if (sameOwner(candidateOwner, inFlight.owner)) inFlight.controller.abort();
		}
	}));
	unsubs.push(deps.events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
		if (!object(value) || value.providerId !== identity.providerId || value.instanceId !== identity.instanceId
			|| !text(value.requestId) || !object(value.owner)
			|| value.owner.sessionId !== deps.sessionId
			|| ![value.owner.runId, value.owner.roleId, value.owner.ownershipId].every(text)
			|| !["ping", "profiles", "inspect", "launch", "resume", "recover", "stop", "update-metadata"].includes(String(value.operation))
			|| pending.has(value.requestId)) return;
		// SAFETY: request shape and ownership fields are validated above.
		const request = value as unknown as WorkflowProviderRequest;
		const controller = new AbortController();
		let settle!: () => void;
		const settled = new Promise<void>((resolve) => { settle = resolve; });
		pending.set(request.requestId, { controller, owner: request.owner, operation: request.operation, settled });
		void handle(request, controller.signal).then(
			(data) => { if (!controller.signal.aborted && live()) reply(request, true, data); },
			(error) => { if (!controller.signal.aborted) reply(request, false, undefined, error); },
		).finally(() => { pending.delete(request.requestId); settle(); });
	}));
	const detach = () => {
		if (closed) return;
		closed = true;
		for (const unsubscribe of unsubs) unsubscribe();
		for (const { controller } of pending.values()) controller.abort();
		pending.clear();
		for (const held of active.values()) {
			try { deps.services.stopSubagent(held.running); } catch { /* Shutdown owns remaining pane cleanup. */ }
			held.controller.abort();
		}
		active.clear();
		if (claims[REGISTRATION_KEY]?.detach === detach) delete claims[REGISTRATION_KEY];
	};
	claims[REGISTRATION_KEY] = { events: deps.events, generation, detach };
	return { identity, detach };
}

/** Real tmux I/O bindings; also usable with an injected execution service. */
export function tmuxWorkflowProviderIO() {
	return {
		readProfile(sessionPath: string): LaunchProfile | null {
			const read = readLaunchProfile(sessionPath);
			if (read.status === "invalid") throw new Error(read.error);
			return read.status === "ok" ? read.profile : null;
		},
		updateProfile(sessionPath: string, workflow: LaunchProfileWorkflowMetadata): void {
			updateLaunchProfile(sessionPath, (profile) => ({ ...profile, workflow }));
		},
		recordLaunchedModel(sessionPath: string, selection: ModelSelection): void {
			updateLaunchProfile(sessionPath, (profile) => ({
				...profile,
				runtime: { ...profile.runtime, lastModel: selection },
			}));
		},
		estimateContext: estimateSavedSessionContext,
		captureEvidence(root: string, definition: RepoBoundaryDefinition = { allowedRules: [], protectedRules: [] }): RepoBoundarySnapshot {
			const snapshot = captureRepoBoundarySnapshot(root, definition);
			if (!snapshot) throw new Error("Workflow repository evidence requires a Git checkout");
			return snapshot;
		},
		finishEvidence(snapshot: unknown): Evidence {
			const report = evaluateRepoBoundarySnapshot(snapshot as RepoBoundarySnapshot);
			return {
				changedFiles: [...new Set([...report.allowedPaths, ...report.unexpectedPaths])],
				...(report.manualReviewReason ? { manualReviewReason: report.manualReviewReason } : {}),
			};
		},
		/** Use the existing discovery precedence, with the exact source path. */
		resolveFile(agentId: string, path: string, body: string): ProfileIdentity {
			return { agentId, path, hash: hashText(readFileSync(path, "utf8")), roleBodyHash: hashText(body) };
		},
	};
}
