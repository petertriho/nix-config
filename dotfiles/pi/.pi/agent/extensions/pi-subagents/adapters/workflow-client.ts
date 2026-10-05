/**
 * Workflow transport client. The coordinator owns workflow state and recovery
 * decisions, while execution adapters own child sessions and panes.
 */
import { randomUUID } from "node:crypto";
import {
	requestWorkflowProvider, captureWorkflowDelivery,
	WorkflowProviderCleanupRequiredError,
	type WorkflowAgentProfile, type WorkflowEventBus, type WorkflowOwner,
	type WorkflowProvider, type WorkflowProviderDelivery, type WorkflowRoleFacts,
	type WorkflowRoleResult,
} from "./workflow-contract.ts";

export interface WorkflowLaunchRequest {
	readonly agentId: string;
	readonly name: string;
	readonly task: string;
	readonly model: { readonly provider: string; readonly model: string; readonly thinking?: string };
	readonly workflow: WorkflowMetadata;
	readonly repositoryRoot: string;
}

/** Transport-neutral shape of the persisted workflow identity in a role sidecar. */
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

export type WorkflowPing = Readonly<Extract<WorkflowProviderDelivery, { kind: "ping" }>>;
export type WorkflowPingHandler = (ping: WorkflowPing, facts?: WorkflowRoleFacts) => void;

function freezeEvidence(result: WorkflowRoleResult): WorkflowRoleResult {
	return Object.freeze({
		sessionPath: result.sessionPath, status: result.status, message: result.message,
		...(result.stopRequired ? { stopRequired: true } : {}),
		...(result.successfulResponse === true ? { successfulResponse: true } : {}),
	});
}

function freezeFacts(facts: WorkflowRoleFacts): WorkflowRoleFacts {
	return Object.freeze({
		sessionPath: facts.sessionPath,
		...(facts.originalSessionPath === undefined ? {} : { originalSessionPath: facts.originalSessionPath }),
		...(facts.replacement === undefined ? {} : { replacement: facts.replacement }),
		profile: Object.freeze({ ...facts.profile }),
		model: Object.freeze({ ...facts.model }),
		context: Object.freeze({ ...facts.context }),
		metadataConfirmed: facts.metadataConfirmed,
		...(facts.userSelectedModel ? { userSelectedModel: true } : {}),
	});
}

export interface WorkflowRoleOwnership {
	stop(): Promise<void>;
	dispose(): void;
}

/** Cleanup-only ownership is not a lease with validated launch facts. */
export class WorkflowRoleCleanupRequiredError extends Error {
	readonly sessionPath: string | undefined;
	readonly ownership: WorkflowRoleOwnership;

	constructor(error: WorkflowProviderCleanupRequiredError, ownership: WorkflowRoleOwnership) {
		super(error.message);
		this.sessionPath = error.sessionPath;
		this.ownership = ownership;
	}
}

export interface WorkflowRoleLease extends WorkflowRoleOwnership {
	readonly facts: WorkflowRoleFacts;
	readonly active: boolean;
	/** Only a correlated, validated result resolves this promise. Provider loss rejects. */
	readonly result: Promise<WorkflowRoleResult>;
	/** Do not navigate the tree until this resolves; failure preserves ownership for retry. */
	stop(): Promise<void>;
	/** Invalidate this ownership (session replacement, shutdown, or explicit recovery). */
	dispose(): void;
}

export interface WorkflowEventClient {
	readonly provider: WorkflowProvider;
	ping(owner: WorkflowOwner): Promise<{ readonly alive: true }>;
	preflight(owner: WorkflowOwner, requiredAgents: readonly string[], options?: { signal?: AbortSignal }): Promise<readonly WorkflowAgentProfile[]>;
	inspect(owner: WorkflowOwner, payload: WorkflowSavedRequest, options?: { signal?: AbortSignal }): Promise<WorkflowRoleFacts>;
	launch(owner: WorkflowOwner, payload: WorkflowLaunchRequest, options?: { onPing?: WorkflowPingHandler; signal?: AbortSignal }): Promise<WorkflowRoleLease>;
	resume(owner: WorkflowOwner, payload: WorkflowSavedRequest, options?: { onPing?: WorkflowPingHandler; signal?: AbortSignal }): Promise<WorkflowRoleLease>;
	recover(owner: WorkflowOwner, payload: WorkflowRecoveryRequest, options?: { onPing?: WorkflowPingHandler; signal?: AbortSignal }): Promise<WorkflowRoleLease>;
	updateMetadata(owner: WorkflowOwner, payload: WorkflowSavedRequest): Promise<{ readonly confirmed: true }>;
	dispose(): void;
}

/**
 * A single provider incarnation is pinned for the life of this client. Never
 * rediscover/fallback inside a run: the coordinator must choose and persist it.
 */
export function createWorkflowEventClient(
	events: WorkflowEventBus,
	identity: WorkflowProvider,
	options: { requestTimeoutMs?: number; livenessIntervalMs?: number } = {},
): WorkflowEventClient {
	const provider: WorkflowProvider = Object.freeze({ ...identity, capabilities: Object.freeze([...identity.capabilities]) });
	if (options.livenessIntervalMs !== undefined
		&& (!Number.isFinite(options.livenessIntervalMs) || options.livenessIntervalMs <= 0)) {
		throw new Error("Workflow provider liveness interval must be a positive finite number");
	}
	const intervalMs = options.livenessIntervalMs ?? 1_000;
	const controller = new AbortController();
	const leases = new Set<WorkflowRoleOwnership>();
	let disposed = false;
	function ensureOpen() {
		if (disposed) throw new Error("Workflow provider client closed");
	}
	function request<K extends Parameters<typeof requestWorkflowProvider>[2]>(
		operation: K, owner: WorkflowOwner, payload: unknown,
		requestId?: string,
		signal?: AbortSignal,
	) {
		ensureOpen();
		return requestWorkflowProvider(events, provider, operation, owner, payload, {
			timeoutMs: options.requestTimeoutMs,
			signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal, requestId,
		});
	}
	function lease(
		owner: WorkflowOwner, delivery: ReturnType<typeof captureWorkflowDelivery>, facts: WorkflowRoleFacts,
		onPing?: WorkflowPingHandler,
	): WorkflowRoleLease {
		const owned = Object.freeze({ ...owner });
		const confirmed = freezeFacts(facts);
		let active = true;
		let stopPending: Promise<void> | undefined;
		let resolveResult!: (result: WorkflowRoleResult) => void;
		let rejectResult!: (error: Error) => void;
		const result = new Promise<WorkflowRoleResult>((resolve, reject) => {
			resolveResult = resolve;
			rejectResult = reject;
		});
		let checkPending = false;
		let timer: ReturnType<typeof setInterval>;
		const close = () => {
			if (!active) return false;
			active = false;
			clearInterval(timer);
			delivery.dispose();
			leases.delete(handle);
			return true;
		};
		const fail = (error: Error) => { if (close()) rejectResult(error); };
		const handle: WorkflowRoleLease = {
			facts: confirmed,
			get active() { return active; },
			result,
			stop() {
				if (!active) return Promise.reject(new Error("Workflow role ownership is no longer active"));
				if (stopPending) return stopPending;
				stopPending = request("stop", owned, { sessionPath: confirmed.sessionPath }).then(() => {
					if (!active) throw new Error("Workflow role ownership expired before stop confirmation");
					fail(new Error("Workflow role stopped by owner"));
				}).finally(() => { stopPending = undefined; });
				return stopPending;
			},
			dispose() { fail(new Error("Workflow role ownership disposed")); },
		};
		leases.add(handle);
		timer = setInterval(() => {
			if (!active || checkPending) return;
			checkPending = true;
			void request("ping", owned, {}).catch((error: unknown) => {
				fail(new Error(`Workflow provider lost: ${error instanceof Error ? error.message : String(error)}`));
			}).finally(() => { checkPending = false; });
		}, intervalMs);
		delivery.confirm(confirmed.sessionPath, (delivery) => {
			if (!active) return;
			if (delivery.kind === "ping") {
				try {
					onPing?.(Object.freeze({
						kind: "ping", message: delivery.message,
					}), confirmed);
				} catch (error) {
					fail(new Error(`Workflow delivery handler failed: ${error instanceof Error ? error.message : String(error)}`));
				}
			} else {
				if (!delivery.result.stopRequired) close();
				resolveResult(freezeEvidence(delivery.result));
			}
		});
		return handle;
	}
	function cleanupOwnership(owner: WorkflowOwner, sessionPath?: string): WorkflowRoleOwnership {
		const owned = Object.freeze({ ...owner });
		let active = true;
		let stopPending: Promise<void> | undefined;
		const handle: WorkflowRoleOwnership = {
			stop() {
				if (!active) return Promise.reject(new Error("Workflow role ownership is no longer active"));
				if (stopPending) return stopPending;
				stopPending = request("stop", owned, sessionPath ? { sessionPath } : {}).then(() => {
					if (!active) throw new Error("Workflow role ownership expired before stop confirmation");
					handle.dispose();
				}).finally(() => { stopPending = undefined; });
				return stopPending;
			},
			dispose() { active = false; leases.delete(handle); },
		};
		leases.add(handle);
		return handle;
	}
	async function start(
		operation: "launch" | "resume" | "recover", owner: WorkflowOwner,
		payload: WorkflowLaunchRequest | WorkflowSavedRequest | WorkflowRecoveryRequest,
		options?: { onPing?: WorkflowPingHandler; signal?: AbortSignal },
	): Promise<WorkflowRoleLease> {
		ensureOpen();
		const owned = Object.freeze({ ...owner });
		const requestId = randomUUID();
		const delivery = captureWorkflowDelivery(events, provider, owned, requestId);
		let response;
		try {
			response = await request(operation, owned, payload, requestId, options?.signal);
			ensureOpen();
			if (options?.signal?.aborted) {
				throw new WorkflowProviderCleanupRequiredError("Workflow provider request cancelled", response.data.sessionPath);
			}
		}
		catch (error) {
			delivery.dispose();
			if (error instanceof WorkflowProviderCleanupRequiredError && !disposed) {
				const ownership = cleanupOwnership(owned, error.sessionPath);
				if (options?.signal?.aborted) {
					try { await ownership.stop(); }
					catch { throw new WorkflowRoleCleanupRequiredError(error, ownership); }
					throw new Error(error.message);
				}
				throw new WorkflowRoleCleanupRequiredError(error, ownership);
			}
			throw error;
		}
		return lease(owned, delivery, response.data, options?.onPing);
	}
	return {
		provider,
		async ping(owner) { return (await request("ping", owner, {})).data; },
		async preflight(owner, requiredAgents, options) {
			await request("ping", owner, {}, undefined, options?.signal);
			const response = await request("profiles", owner, { requiredAgents: [...requiredAgents] }, undefined, options?.signal);
			return Object.freeze(response.data.profiles.map((profile) => Object.freeze({ ...profile })));
		},
		async inspect(owner, payload, options) { return freezeFacts((await request("inspect", owner, payload, undefined, options?.signal)).data); },
		launch(owner, payload, options) { return start("launch", owner, payload, options); },
		resume(owner, payload, options) { return start("resume", owner, payload, options); },
		recover(owner, payload, options) { return start("recover", owner, payload, options); },
		async updateMetadata(owner, payload) { return (await request("update-metadata", owner, payload)).data; },
		dispose() {
			if (disposed) return;
			disposed = true;
			controller.abort();
			for (const held of [...leases]) held.dispose();
		},
	};
}
