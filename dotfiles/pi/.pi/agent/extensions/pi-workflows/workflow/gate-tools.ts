import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	createWorkflowGateController,
	getPendingWorkflowGate,
	type WorkflowGateDependencies,
} from "./plannotator.ts";
import {
	getActiveWorkflowRun,
	recordWorkflowGateAttempt,
	type WorkflowRunTransitionResult,
} from "./state.ts";
import type { WorkflowToolStateStore } from "./tools.ts";

export const WorkflowGateParams = Type.Object({
	runId: Type.String({ minLength: 1, description: "Active workflow run ID" }),
	gate: Type.String({
		pattern: "^[a-z](?:[a-z0-9-]*[a-z0-9])?$",
		maxLength: 64,
		description: "Safe gate label, such as plan, tasks, or review",
	}),
	artifact: Type.String({ minLength: 1, description: "Declared file data-slot ID to review" }),
	reviewDirectory: Type.Optional(Type.Boolean({
		description: "Review the artifact's parent directory instead of the single file",
	})),
	data: Type.Optional(Type.Record(Type.String({ minLength: 1 }), Type.String({ minLength: 1 }))),
});

export interface WorkflowGateRuntimeOptions {
	readonly shouldRegister?: (name: string) => boolean;
	readonly isParent?: () => boolean;
	readonly onError?: (error: Error) => void;
	readonly hasOwnedRole?: () => boolean;
	/** Dependency injection for process tests. Production uses the installed CLI. */
	readonly transport?: Pick<WorkflowGateDependencies, "spawn" | "now" | "newId">;
}

export function isWorkflowGateParent(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return !env.PI_SUBAGENT_ID && !env.PI_SUBAGENT_SESSION
		&& !env.PI_SUBAGENT_NAME && !env.PI_SUBAGENT_AGENT;
}

/**
 * Owns session-scoped browser processes and wraps ALL workflow commits, including
 * slash-command abort/replacement and lifecycle tools. Terminal snapshots already
 * interrupt their pending histories; the wrapper then stops the owned process.
 */
export function registerWorkflowGateTool(
	pi: ExtensionAPI,
	store: WorkflowToolStateStore,
	options: WorkflowGateRuntimeOptions = {},
) {
	let sessionId: string | null = null;
	let sessionFile: string | undefined;
	const isParent = options.isParent ?? isWorkflowGateParent;

	function makeController() {
		const owner = sessionId;
		return createWorkflowGateController({
			...options.transport,
			getActiveRun: () => getActiveWorkflowRun(store.getState()),
			getSessionId: () => sessionId,
			persistAttempt: (attempt, data) => {
				if (!owner || sessionId !== owner || attempt.sessionId !== owner) {
					throw new Error("The browser gate belongs to a different parent session.");
				}
				state.commit(recordWorkflowGateAttempt(store.getState(), attempt, data));
			},
			notify: (notification) => {
				if (!owner || sessionId !== owner || notification.sessionId !== owner) return;
				const active = getActiveWorkflowRun(store.getState());
				if (active?.runId !== notification.runId
					|| active.gateHistory?.at(-1)?.id !== notification.attemptId) return;
				pi.sendMessage({
					customType: notification.type,
					content: notification.content,
					display: true,
					details: notification,
				}, notification.type === "workflow_gate_result"
					? { deliverAs: "steer", triggerTurn: true }
					: { triggerTurn: false });
			},
			onError: (error) => {
				if (!owner || sessionId !== owner) return;
				options.onError?.(error);
				try {
					pi.sendMessage({
						customType: "workflow_gate_error",
						content: `Browser gate persistence or delivery failed: ${error.message}\n`
							+ "No approval was accepted. Abort or reload the run before asking the gate's chat fallback question.",
						display: true,
					}, { deliverAs: "steer", triggerTurn: true });
				} catch {
					// A torn-down session cannot receive a message. Restore fails closed.
				}
			},
		});
	}

	let controller = makeController();
	const state: WorkflowToolStateStore = {
		getState: () => store.getState(),
		commit(transition: WorkflowRunTransitionResult) {
			const before = getActiveWorkflowRun(store.getState());
			const pending = getPendingWorkflowGate(before);
			try {
				store.commit(transition);
			} finally {
				// Also kill on a partial persistence failure that invalidated live state.
				const after = getActiveWorkflowRun(store.getState());
				if (before && pending && (
					after?.runId !== before.runId || getPendingWorkflowGate(after)?.id !== pending.id
				)) {
					controller.interrupt("Workflow gate ended or was replaced.", before.runId);
				}
			}
		},
	};

	if (isParent() && (options.shouldRegister?.("workflow_gate") ?? true)) {
		pi.registerTool({
			name: "workflow_gate",
			label: "Workflow Gate",
			description: "Open a declared workflow artifact in Plannotator for an explicit user decision. "
				+ "Parent-only, fire-and-forget: returns immediately and delivers workflow_gate_result on process closure. "
				+ "Never poll, sleep, or read a decision file before that result. "
				+ "Missing, invalid, or interrupted results require the gate's chat fallback. "
				+ "Process logs are bounded to 8192 characters; feedback over 24000 characters is referenced by file, not truncated.",
			promptSnippet: "Open an asynchronous Plannotator review gate for the active workflow.",
			parameters: WorkflowGateParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				if (!isParent()) throw new Error("Only the parent orchestrator can open workflow gates.");
				if (options.hasOwnedRole?.()) throw new Error("A workflow role still owns execution or needs explicit provider recovery; no browser gate may overlap it.");
				if (signal?.aborted) throw new Error("Workflow gate launch cancelled.");
				if (!sessionId || !sessionFile || ctx.sessionManager.getSessionFile() !== sessionFile) {
					throw new Error("Workflow gates require the current persistent parent session.");
				}
				try {
					const result = controller.start(params);
					return { content: [{ type: "text" as const, text: result.message }], details: result };
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					throw new Error(`Browser gate did not start: ${message} No approval was accepted.`);
				}
			},
		});
	}

	return {
		state,
		startSession(file: string | undefined): void {
			controller.shutdown("Parent session or branch changed; ask the gate's chat fallback question.");
			sessionFile = file;
			sessionId = file ? randomUUID() : null;
			controller = makeController();
		},
		shutdown(): void {
			controller.shutdown("Parent session ended; ask the gate's chat fallback question after resume.");
			sessionId = null;
			sessionFile = undefined;
		},
	};
}
