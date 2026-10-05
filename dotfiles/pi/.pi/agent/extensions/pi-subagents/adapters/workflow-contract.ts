import { randomUUID } from "node:crypto";

export interface WorkflowEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
	emit(channel: string, data: unknown): void;
}

export const WORKFLOW_PROVIDER_VERSION = 1;
export const WORKFLOW_PROVIDER_CAPABILITIES = [
	"profiles", "launch", "resume", "recovery", "owned-stop", "async-results",
	"repository-evidence", "context-facts", "metadata-updates", "inspect",
] as const;
export type WorkflowProviderCapability = typeof WORKFLOW_PROVIDER_CAPABILITIES[number];

export interface WorkflowProvider {
	readonly providerId: string;
	/** Changes on reload; prevents a previous incarnation from answering a new request. */
	readonly instanceId: string;
	readonly version: typeof WORKFLOW_PROVIDER_VERSION;
	readonly ready: true;
	readonly capabilities: readonly WorkflowProviderCapability[];
}

export const WORKFLOW_PROVIDER_DISCOVER_CHANNEL = "pi-workflows:provider:discover";
const MAX_DISCOVERY_TIMEOUT_MS = 5_000;
const MAX_REQUEST_TIMEOUT_MS = 300_000;

function timeout(value: number | undefined, maximum = MAX_DISCOVERY_TIMEOUT_MS, fallback = 250): number {
	if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
		throw new Error("Workflow provider timeout must be a positive finite number");
	}
	return Math.min(value ?? fallback, maximum);
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function provider(value: unknown): value is WorkflowProvider {
	return record(value)
		&& typeof value.providerId === "string" && value.providerId.length > 0
		&& typeof value.instanceId === "string" && value.instanceId.length > 0
		&& value.version === WORKFLOW_PROVIDER_VERSION && value.ready === true
		&& Array.isArray(value.capabilities)
		&& WORKFLOW_PROVIDER_CAPABILITIES.every((capability) => (value.capabilities as unknown[]).includes(capability));
}

/** Collect, rather than select, all eligible providers during a bounded startup handshake. */
export function discoverWorkflowProviders(
	events: WorkflowEventBus,
	options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<WorkflowProvider[]> {
	const wait = timeout(options.timeoutMs);
	if (options.signal?.aborted) return Promise.resolve([]);
	const requestId = randomUUID();
	return new Promise((resolve) => {
		const found = new Map<string, WorkflowProvider>();
		const ambiguous = new Set<string>();
		let timer: ReturnType<typeof setTimeout>;
		let probeTimer: ReturnType<typeof setInterval>;
		const finish = (aborted = false) => {
			clearTimeout(timer);
			clearInterval(probeTimer);
			unsubscribe();
			options.signal?.removeEventListener("abort", abort);
			resolve(aborted ? [] : [...found.values()]);
		};
		const abort = () => finish(true);
		const unsubscribe = events.on(`${WORKFLOW_PROVIDER_DISCOVER_CHANNEL}:reply:${requestId}`, (value) => {
			if (!record(value) || value.requestId !== requestId || !provider(value)) return;
			if (ambiguous.has(value.providerId)) return;
			const previous = found.get(value.providerId);
			if (previous && previous.instanceId !== value.instanceId) {
				found.delete(value.providerId);
				ambiguous.add(value.providerId);
			} else found.set(value.providerId, value);
		});
		timer = setTimeout(finish, wait);
		options.signal?.addEventListener("abort", abort, { once: true });
		if (options.signal?.aborted) abort();
		else {
			const probe = () => events.emit(WORKFLOW_PROVIDER_DISCOVER_CHANNEL, { requestId, version: WORKFLOW_PROVIDER_VERSION });
			probeTimer = setInterval(probe, Math.min(25, Math.max(1, Math.floor(wait / 3))));
			probe();
		}
	});
}

/** Ownership belongs to the parent session, not to a provider or child agent. */
export interface WorkflowOwner {
	readonly sessionId: string;
	readonly runId: string;
	readonly roleId: string;
	/** Changes whenever this role is replaced/restarted, invalidating prior replies. */
	readonly ownershipId: string;
}

export interface WorkflowLaunchRequest {
	readonly agentId: string;
	readonly name: string;
	readonly task: string;
	readonly model: { readonly provider: string; readonly model: string; readonly thinking?: string };
	readonly workflow: WorkflowMetadata;
	readonly repositoryRoot: string;
}

/** Wire metadata, not a validated or version-coupled persisted sidecar. */
export interface WorkflowMetadata {
	readonly version: number;
	readonly workflowId: string;
	readonly runId: string;
	readonly roleId: string;
	readonly manifestHash: string;
	readonly skillHash: string;
	readonly policy: string;
	readonly assignmentSource: string;
	readonly projectRoot: string;
	readonly originalDefault?: { readonly provider: string; readonly model: string; readonly thinking?: string };
	readonly currentDefault?: { readonly provider: string; readonly model: string; readonly thinking?: string };
	readonly data: object;
}

export interface WorkflowSavedRequest {
	readonly sessionPath: string;
	readonly expected: {
		readonly agentId: string;
		readonly profileHash: string;
		readonly model?: { readonly provider: string; readonly model: string; readonly thinking?: string };
		readonly contextTokens?: number;
	};
	readonly workflow: WorkflowMetadata;
	readonly repositoryRoot: string;
	readonly name?: string;
	readonly message?: string;
	readonly rolloverMessage?: string;
	readonly model?: { readonly provider: string; readonly model: string; readonly thinking?: string };
	readonly allowRollover?: boolean;
	readonly allowUserModelSelection?: boolean;
}

export interface WorkflowRecoveryRequest extends WorkflowSavedRequest {
	readonly failure: string;
	readonly model: { readonly provider: string; readonly model: string; readonly thinking?: string };
}

/** Canonical operation/request/outcome pairing for version 1 event messages. */
export interface WorkflowProviderOperations {
	ping: { readonly request: Record<string, never>; readonly outcome: { readonly alive: true } };
	profiles: {
		readonly request: { readonly requiredAgents: readonly string[] };
		readonly outcome: { readonly profiles: readonly WorkflowAgentProfile[] };
	};
	inspect: { readonly request: WorkflowSavedRequest; readonly outcome: WorkflowRoleFacts };
	launch: { readonly request: WorkflowLaunchRequest; readonly outcome: WorkflowRoleFacts & { readonly accepted: true } };
	resume: { readonly request: WorkflowSavedRequest; readonly outcome: WorkflowRoleFacts };
	recover: { readonly request: WorkflowRecoveryRequest; readonly outcome: WorkflowRoleFacts };
	stop: {
		/** No path: cancel/drain this owner's pending starts and stop all its children before confirming. */
		readonly request: { readonly sessionPath?: string };
		readonly outcome: { readonly stopped: true };
	};
	"update-metadata": { readonly request: WorkflowSavedRequest; readonly outcome: { readonly confirmed: true } };
}

export type WorkflowProviderOperation = keyof WorkflowProviderOperations;
export type WorkflowProviderPayloads = {
	readonly [K in WorkflowProviderOperation]: WorkflowProviderOperations[K]["request"];
};
type OperationOutcomes = {
	[K in WorkflowProviderOperation]: WorkflowProviderOperations[K]["outcome"];
};
/** Keep the existing public interface while deriving its outcomes from the pairing. */
export interface WorkflowProviderOutcomes extends OperationOutcomes {}

const REQUEST_TIMEOUT_MS: Record<WorkflowProviderOperation, number> = {
	ping: 1_000,
	profiles: 3_000,
	inspect: 10_000,
	launch: 30_000,
	resume: 120_000,
	recover: 120_000,
	stop: 10_000,
	"update-metadata": 10_000,
};

/** Validate operation names at unknown event ingress using the contract's complete timeout table. */
export function isWorkflowProviderOperation(value: unknown): value is WorkflowProviderOperation {
	return typeof value === "string" && Object.hasOwn(REQUEST_TIMEOUT_MS, value);
}

export const WORKFLOW_PROVIDER_REQUEST_CHANNEL = "pi-workflows:provider:request";
export const WORKFLOW_PROVIDER_DELIVERY_CHANNEL = "pi-workflows:provider:delivery";
export const WORKFLOW_PROVIDER_CANCEL_CHANNEL = "pi-workflows:provider:cancel";

function sameOwner(left: unknown, right: WorkflowOwner): boolean {
	return record(left) && left.sessionId === right.sessionId && left.runId === right.runId
		&& left.roleId === right.roleId && left.ownershipId === right.ownershipId;
}

function validOwner(owner: WorkflowOwner): boolean {
	return [owner.sessionId, owner.runId, owner.roleId, owner.ownershipId]
		.every((part) => typeof part === "string" && part.length > 0);
}

/** Compatible correlation envelope: unknown payloads still require provider validation. */
export interface WorkflowProviderRequest<T = unknown> {
	readonly requestId: string;
	readonly providerId: string;
	readonly instanceId: string;
	readonly owner: WorkflowOwner;
	readonly operation: WorkflowProviderOperation;
	readonly payload: T;
}

/** Narrowing operation also narrows payload; arbitrary event data is not this type. */
export type WorkflowProviderRequestFor<K extends WorkflowProviderOperation = WorkflowProviderOperation> = {
	[P in K]: WorkflowProviderRequest<WorkflowProviderPayloads[P]> & { readonly operation: P };
}[K];

/** Adapter-validated role session identity and facts; no transport-specific data. */
export interface WorkflowRoleFacts {
	readonly sessionPath: string;
	/** Present only for a verified fresh rollover replacing a saved session. */
	readonly originalSessionPath?: string;
	readonly replacement?: true;
	readonly profile: { readonly agentId: string; readonly path: string; readonly hash: string };
	readonly model: { readonly provider: string; readonly model: string; readonly thinking?: string };
	readonly context: { readonly tokens: number; readonly source: string };
	readonly metadataConfirmed: true;
	/** The provider's interactive context/model gate supplied this selection. */
	readonly userSelectedModel?: true;
}

function nonempty(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function validRoleFacts(value: unknown, payload: unknown): value is WorkflowRoleFacts {
	if (!record(value) || !record(value.profile) || !record(value.model) || !record(value.context)) return false;
	if (!nonempty(value.sessionPath) || !nonempty(value.profile.agentId)
		|| !nonempty(value.profile.path) || !nonempty(value.profile.hash)
		|| !nonempty(value.model.provider) || !nonempty(value.model.model)
		|| typeof value.context.tokens !== "number" || !Number.isFinite(value.context.tokens)
		|| value.context.tokens < 0 || !nonempty(value.context.source)
		|| value.metadataConfirmed !== true) return false;
	if (record(payload) && nonempty(payload.sessionPath) && value.sessionPath !== payload.sessionPath
		&& (payload.allowRollover !== true || value.replacement !== true
			|| value.originalSessionPath !== payload.sessionPath)) return false;
	if (record(payload)) {
		if (nonempty(payload.agentId) && payload.agentId !== value.profile.agentId) return false;
		const expected = record(payload.expected) ? payload.expected : undefined;
		if (nonempty(expected?.agentId) && expected.agentId !== value.profile.agentId) return false;
		if (nonempty(expected?.profileHash) && expected.profileHash !== value.profile.hash) return false;
		const selectedModel = record(payload.model) ? payload.model : expected?.model;
		const userSelection = payload.allowUserModelSelection === true && value.userSelectedModel === true;
		if (!userSelection && record(selectedModel) && (selectedModel.provider !== value.model.provider
			|| selectedModel.model !== value.model.model
			|| (selectedModel.thinking ?? "off") !== (value.model.thinking ?? "off"))) return false;
		if (expected?.contextTokens !== undefined && (typeof expected.contextTokens !== "number"
			|| !Number.isFinite(expected.contextTokens) || expected.contextTokens !== value.context.tokens)
			&& value.replacement !== true) return false;
	}
	return true;
}

export interface WorkflowAgentProfile {
	readonly agentId: string;
	readonly path: string;
	readonly hash: string;
}

/** A launch may own a child, but its facts or cleanup were not confirmed. */
export class WorkflowProviderCleanupRequiredError extends Error {
	readonly sessionPath: string | undefined;

	constructor(message: string, sessionPath?: string) {
		super(message);
		this.sessionPath = sessionPath;
	}
}

function validProfiles(value: unknown, payload: unknown): boolean {
	if (!record(value) || !Array.isArray(value.profiles)
		|| !value.profiles.every((profile: unknown) => record(profile)
			&& nonempty(profile.agentId) && nonempty(profile.path) && nonempty(profile.hash))) return false;
	return !record(payload) || !Array.isArray(payload.requiredAgents)
		|| payload.requiredAgents.every((agent: unknown) => nonempty(agent)
			&& (value.profiles as WorkflowAgentProfile[]).some((profile) => profile.agentId === agent));
}

/** A matched failure rejects; a mismatched reply is ignored until timeout or cancellation. */
export function requestWorkflowProvider<K extends WorkflowProviderOperation>(
	events: WorkflowEventBus,
	providerIdentity: WorkflowProvider,
	operation: K,
	owner: WorkflowOwner,
	payload: WorkflowProviderPayloads[NoInfer<K>],
	options: { timeoutMs?: number; signal?: AbortSignal; requestId?: string } = {},
): Promise<{ requestId: string; data: WorkflowProviderOutcomes[K] }> {
	const wait = timeout(options.timeoutMs, MAX_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS[operation]);
	if (!provider(providerIdentity) || !validOwner(owner)) {
		return Promise.reject(new Error("Invalid workflow provider or role ownership"));
	}
	// TypeScript callers are typed; JavaScript event peers still supply unknown data.
	const ingressPayload: unknown = payload;
	if ((operation === "inspect" || operation === "resume" || operation === "recover")
		&& (!record(ingressPayload) || !nonempty(ingressPayload.sessionPath) || !record(ingressPayload.expected)
			|| !nonempty(ingressPayload.expected.agentId) || !nonempty(ingressPayload.expected.profileHash))) {
		return Promise.reject(new Error("Workflow provider requires expected session and profile identity"));
	}
	if (options.signal?.aborted) return Promise.reject(new Error("Workflow provider request cancelled"));
	const requestId = options.requestId ?? randomUUID();
	const request: WorkflowProviderRequest<WorkflowProviderPayloads[K]> = {
		requestId, providerId: providerIdentity.providerId, instanceId: providerIdentity.instanceId,
		owner: { ...owner }, operation, payload,
	};
	const unconfirmed = (message: string) =>
		operation === "launch" || operation === "resume" || operation === "recover"
			? new WorkflowProviderCleanupRequiredError(message) : new Error(message);
	return new Promise<{ requestId: string; data: WorkflowProviderOutcomes[K] }>((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout>;
		let settled = false;
		const finish = (error?: Error, result?: WorkflowProviderOutcomes[K]) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			options.signal?.removeEventListener("abort", abort);
			if (error) reject(error);
			else resolve({ requestId, data: result as WorkflowProviderOutcomes[K] });
		};
		const abort = () => {
			events.emit(WORKFLOW_PROVIDER_CANCEL_CHANNEL, request);
			finish(unconfirmed("Workflow provider request cancelled"));
		};
		const unsubscribe = events.on(`pi-workflows:provider:reply:${requestId}`, (value) => {
			if (!record(value) || value.requestId !== requestId
				|| value.providerId !== request.providerId || value.instanceId !== request.instanceId
				|| !sameOwner(value.owner, request.owner)) return;
			if (value.ok === false) {
				const message = typeof value.error === "string" ? value.error : "Workflow provider rejected request";
				finish((operation === "launch" || operation === "resume" || operation === "recover")
					&& record(value.cleanupRequired) && nonempty(value.cleanupRequired.sessionPath)
					? new WorkflowProviderCleanupRequiredError(message, value.cleanupRequired.sessionPath)
					: new Error(message));
			} else if (value.ok === true) {
				if ((operation === "inspect" || operation === "launch" || operation === "resume" || operation === "recover")
					&& (!validRoleFacts(value.data, payload)
						|| (operation === "launch" && record(value.data) && value.data.accepted !== true))) {
					finish(unconfirmed("Workflow provider returned incomplete or unconfirmed role facts"));
				} else if (operation === "stop" && (!record(value.data) || value.data.stopped !== true)) {
					finish(new Error("Workflow provider returned unconfirmed owned stop"));
				} else if (operation === "update-metadata" && (!record(value.data) || value.data.confirmed !== true)) {
					finish(new Error("Workflow provider returned unconfirmed metadata update"));
				} else if (operation === "profiles" && !validProfiles(value.data, payload)) {
					finish(new Error("Workflow provider required agent profile unavailable"));
				} else if (operation === "ping" && (!record(value.data) || value.data.alive !== true)) {
					finish(new Error("Workflow provider unavailable"));
				} else finish(undefined, value.data as WorkflowProviderOutcomes[K]);
			}
		});
		timer = setTimeout(() => {
			events.emit(WORKFLOW_PROVIDER_CANCEL_CHANNEL, request);
			finish(unconfirmed("Workflow provider request timed out"));
		}, wait);
		options.signal?.addEventListener("abort", abort, { once: true });
		if (options.signal?.aborted) abort();
		else events.emit(WORKFLOW_PROVIDER_REQUEST_CHANNEL, request);
	});
}

export type WorkflowProviderDelivery =
	| { readonly kind: "ping"; readonly message: string }
	| { readonly kind: "result"; readonly result: WorkflowRoleResult };

export interface WorkflowRoleResult {
	readonly sessionPath: string;
	readonly status: "completed" | "failed" | "stopped";
	readonly message: string;
	/** The watcher finished but transport cleanup did not confirm the child stopped. */
	readonly stopRequired?: boolean;
	/** A successful new response was confirmed, not merely a launch or clean exit. */
	readonly successfulResponse?: boolean;
}

/** Capture correlated deliveries before emitting a start; confirm facts before consuming them. */
export function captureWorkflowDelivery(
	events: WorkflowEventBus,
	providerIdentity: WorkflowProvider,
	owner: WorkflowOwner,
	launchRequestId: string,
): { confirm(sessionPath: string, onDelivery: (delivery: WorkflowProviderDelivery) => void): void; dispose(): void } {
	if (!provider(providerIdentity) || !validOwner(owner) || !launchRequestId) {
		throw new Error("Invalid workflow delivery ownership");
	}
	let finished = false;
	let sessionPath: string | undefined;
	let onDelivery: ((delivery: WorkflowProviderDelivery) => void) | undefined;
	const early: WorkflowProviderDelivery[] = [];
	const dispose = () => { finished = true; early.length = 0; unsubscribe(); };
	const deliver = (delivery: WorkflowProviderDelivery) => {
		if (finished || !onDelivery) return;
		if (delivery.kind === "result") {
			if (delivery.result.sessionPath !== sessionPath) return;
			dispose();
		}
		onDelivery(delivery);
	};
	const unsubscribe = events.on(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, (value) => {
		if (finished) return;
		if (!record(value) || value.requestId !== launchRequestId
			|| value.providerId !== providerIdentity.providerId || value.instanceId !== providerIdentity.instanceId
			|| !sameOwner(value.owner, owner)) return;
		let delivery: WorkflowProviderDelivery;
		if (value.kind === "ping" && typeof value.message === "string") {
			// SAFETY: The correlation and payload checks validate this ping.
			delivery = Object.freeze({ ...value, owner: Object.freeze({ ...owner }) }) as unknown as WorkflowProviderDelivery;
		} else if (value.kind === "result" && record(value.result)
			&& nonempty(value.result.sessionPath)
			&& typeof value.result.message === "string"
			&& ["completed", "failed", "stopped"].includes(String(value.result.status))
			&& (value.result.stopRequired === undefined || typeof value.result.stopRequired === "boolean")
			&& (value.result.successfulResponse === undefined || typeof value.result.successfulResponse === "boolean")) {
			// SAFETY: The runtime checks validate the result shape and its owner.
			delivery = Object.freeze({
				...value, owner: Object.freeze({ ...owner }), result: Object.freeze({ ...value.result }),
			}) as unknown as WorkflowProviderDelivery;
		} else return;
		if (onDelivery) deliver(delivery);
		// Keep early capture bounded without allowing repeated pings to evict results.
		else if (early.length < 32) early.push(delivery);
		else if (delivery.kind === "result") {
			const pingIndex = early.findIndex((buffered) => buffered.kind === "ping");
			if (pingIndex !== -1) {
				early.splice(pingIndex, 1);
				early.push(delivery);
			}
		}
	});
	return {
		confirm(path, handler) {
			if (!nonempty(path)) throw new Error("Invalid workflow delivery session");
			if (finished || onDelivery) return;
			sessionPath = path;
			onDelivery = handler;
			const buffered = early.splice(0);
			for (const delivery of buffered) deliver(delivery);
		},
		dispose,
	};
}

/** Dispose when a launch is replaced, the parent session changes, or Pi reloads. */
export function subscribeWorkflowDelivery(
	events: WorkflowEventBus,
	providerIdentity: WorkflowProvider,
	owner: WorkflowOwner,
	launchRequestId: string,
	onDelivery: (delivery: WorkflowProviderDelivery) => void,
	{ sessionPath }: { sessionPath: string },
): () => void {
	if (!nonempty(sessionPath)) throw new Error("Invalid workflow delivery ownership");
	const delivery = captureWorkflowDelivery(events, providerIdentity, owner, launchRequestId);
	delivery.confirm(sessionPath, onDelivery);
	return delivery.dispose;
}
