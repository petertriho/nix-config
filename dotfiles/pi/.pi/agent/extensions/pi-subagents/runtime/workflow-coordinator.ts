import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { createWorkflowEventClient, type WorkflowEventClient } from "../adapters/workflow-client.ts";
import { createWorkflowStartupHandshake } from "./workflow-discovery.ts";
import { registerWorkflowGateTool } from "../workflow/gate-tools.ts";
import { registerWorkflowCommands } from "../workflow/runtime.ts";
import {
	createWorkflowRunState, getActiveWorkflowRun, persistWorkflowRunSnapshots, restoreWorkflowRunStateFromSession,
	type WorkflowRunTransitionResult,
} from "../workflow/state.ts";
import { registerWorkflowLifecycleTools } from "../workflow/tools.ts";
import type { WorkflowProvider } from "../adapters/workflow-contract.ts";

const RELOAD_KEY = Symbol.for("pi-workflows/session-shutdown");
// SAFETY: This symbol stores only the optional cleanup callback owned by this coordinator.
const reloadGlobal = globalThis as unknown as Record<symbol, (() => void) | undefined>;

export function createWorkflowCoordinator(pi: ExtensionAPI) {
	// The entry point can reload while this internal module remains cached.
	reloadGlobal[RELOAD_KEY]?.();
	let state = createWorkflowRunState();
	const clients = new Map<string, WorkflowEventClient>();
	let providers: readonly WorkflowProvider[] = [];
	let registered = false;
	let disabled = false;
	let generation = 0;
	let ready: Promise<void> = Promise.resolve();
	let handshake: ReturnType<typeof createWorkflowStartupHandshake> | undefined;
	let gates: ReturnType<typeof registerWorkflowGateTool> | undefined;
	let lifecycle: ReturnType<typeof registerWorkflowLifecycleTools> | undefined;
	let commands: ReturnType<typeof registerWorkflowCommands> | undefined;
	let latestCtx: ExtensionContext | undefined;
	const denied = new Set((process.env.PI_DENY_TOOLS ?? "").split(",").map((name) => name.trim()).filter(Boolean));
	const shouldRegister = (name: string) => !denied.has(name);

	function commit(transition: WorkflowRunTransitionResult) {
		let appended = 0;
		try {
			for (const snapshot of transition.snapshots) {
				persistWorkflowRunSnapshots(pi, [snapshot]);
				appended++;
			}
		} catch (error) {
			if (appended) state = createWorkflowRunState();
			throw new Error(`Workflow state persistence failed after ${appended} of ${transition.snapshots.length} snapshots: ${String(error)}`);
		}
		state = transition.state;
	}

	function clientFor(id: string): WorkflowEventClient {
		const identity = providers.find((provider) => provider.providerId === id);
		if (!identity) throw new Error(`Bound workflow provider "${id}" is unavailable; reload with the original provider. No migration was performed.`);
		let client = clients.get(id);
		if (!client) {
			client = createWorkflowEventClient(pi.events, identity);
			clients.set(id, client);
		}
		return client;
	}

	function restore(ctx: ExtensionContext) {
		const restored = restoreWorkflowRunStateFromSession(ctx.sessionManager);
		state = restored.state;
		try { persistWorkflowRunSnapshots(pi, restored.snapshots); }
		catch (error) {
			ctx.ui.notify(`Workflow interruption restored in memory; persistence failed: ${String(error)}`, "warning");
		}
	}

	function register(available: readonly WorkflowProvider[]) {
		providers = available;
		if (!latestCtx) return;
		if (!registered) {
			gates = registerWorkflowGateTool(pi, { getState: () => state, commit }, {
				hasOwnedRole: () => lifecycle?.hasOwnedRole() ?? false,
				shouldRegister,
				onError: (error) => { try { latestCtx?.ui.notify(error.message, "error"); } catch { /* UI may be closed */ } },
			});
			lifecycle = registerWorkflowLifecycleTools(pi, {
				state: gates.state,
				get eventExecution() {
					const run = getActiveWorkflowRun(state);
					return run ? clientFor(run.providerId ?? "pi-agent-teams") : undefined;
				},
			}, { shouldRegister });
			commands = registerWorkflowCommands(pi, {
				state: gates.state,
				getBranchGeneration: () => generation,
				stopOwnedRole: () => lifecycle!.stopOwnedRoles(),
				loadAgent: () => ({}), // Agent availability is checked by the selected provider below.
				isTmuxAvailable: () => providers.length > 0,
				muxSetupHint: () => "Connect a compatible workflow execution provider.",
				chooseProvider: async (definition, ctx) => {
					const epoch = generation;
					let selected = providers.length === 1 ? providers[0]?.providerId : undefined;
					if (!selected && ctx.hasUI) selected = await ctx.ui.select(
						"Workflow execution provider", providers.map((provider) => provider.providerId),
					);
					if (!selected || epoch !== generation || !providers.some((provider) => provider.providerId === selected)) return null;
					await clientFor(selected).preflight({
						sessionId: ctx.sessionManager.getSessionId(), runId: `setup-${randomUUID()}`,
						roleId: "setup", ownershipId: randomUUID(),
					}, definition.roles.filter((role) => !role.optional).map((role) => role.agent));
					return epoch === generation ? selected : null;
				},
				validateProvider: (snapshot) => { clientFor(snapshot.providerId ?? "pi-agent-teams"); },
				validateProviderAgents: async (id, agents, ctx) => {
					await clientFor(id).preflight({
						sessionId: ctx.sessionManager.getSessionId(), runId: `setup-${randomUUID()}`,
						roleId: "setup", ownershipId: randomUUID(),
					}, agents);
				},
			});
			registered = true;
		}
		gates!.startSession(latestCtx.sessionManager.getSessionFile());
		restore(latestCtx);
		commands!.refreshRegistry(latestCtx);
		commands!.restoreActiveRunUx(latestCtx);
	}

	function disposeTransport() {
		generation++;
		lifecycle?.endSession();
		handshake?.shutdown();
		gates?.shutdown();
		for (const client of clients.values()) client.dispose();
		clients.clear();
		providers = [];
	}
	reloadGlobal[RELOAD_KEY] = disposeTransport;

	function startSession(ctx: ExtensionContext): void {
		disposeTransport();
		latestCtx = ctx;
		if (disabled) return;
		handshake = createWorkflowStartupHandshake(pi.events, {
			env: process.env,
			register,
			notify: (message) => {
				if (!registered) disabled = true;
				try { ctx.ui.notify(message, "warning"); } catch { /* UI may be closed */ }
			},
		});
		// Pi dispatches session_start sequentially. Do not hold that dispatch
		// while a later provider still needs its own session_start to attach.
		ready = handshake.start();
	}

	async function beforeAgentStart(): Promise<void> {
		await ready;
	}

	async function shutdown(): Promise<void> {
		try { lifecycle?.endSession(); }
		finally {
			disposeTransport();
			state = createWorkflowRunState();
			latestCtx = undefined;
		}
	}

	async function beforeTree(ctx: ExtensionContext) {
		// Invalidate command approvals before navigation's asynchronous cleanup.
		generation++;
		await ready;
		if (!registered) return;
		gates?.startSession(ctx.sessionManager.getSessionFile());
		try { await lifecycle?.stopBeforeTree(); }
		catch (error) {
			try { ctx.ui.notify(`Tree navigation cancelled: could not stop the workflow role: ${String(error)}. Saved sessions and artifacts are preserved.`, "error"); } catch { /* fail closed even without UI */ }
			return { cancel: true };
		}
	}

	function restoreTree(ctx: ExtensionContext): void {
		generation++;
		if (!registered) return;
		restore(ctx);
		commands?.restoreActiveRunUx(ctx);
	}

	return { startSession, beforeAgentStart, shutdown, beforeTree, restoreTree };
}

export type WorkflowCoordinator = ReturnType<typeof createWorkflowCoordinator>;
