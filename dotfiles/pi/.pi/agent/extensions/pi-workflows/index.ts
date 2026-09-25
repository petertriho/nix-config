import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { createWorkflowEventClient, type WorkflowEventClient } from "./event-client.ts";
import { createWorkflowStartupHandshake } from "./startup-handshake.ts";
import { registerWorkflowGateTool } from "./workflow/gate-tools.ts";
import { registerWorkflowCommands } from "./workflow/runtime.ts";
import {
	createWorkflowRunState, getActiveWorkflowRun, persistWorkflowRunSnapshots, restoreWorkflowRunStateFromSession,
	type WorkflowRunTransitionResult,
} from "./workflow/state.ts";
import { registerWorkflowLifecycleTools } from "./workflow/tools.ts";
import type { WorkflowProvider } from "../workflow-provider/contract.ts";

const RELOAD_KEY = Symbol.for("pi-workflows/session-shutdown");
const reloadGlobal = globalThis as unknown as Record<symbol, (() => void) | undefined>;
reloadGlobal[RELOAD_KEY]?.();

/** Own workflow registration, durable state, gates, and repository policy. */
export default function piWorkflows(pi: ExtensionAPI): void {
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
				onError: (error) => { try { latestCtx?.ui.notify(error.message, "error"); } catch { /* closed */ } },
			});
			lifecycle = registerWorkflowLifecycleTools(pi, {
				state: gates.state,
				get eventExecution() {
					const run = getActiveWorkflowRun(state);
					return run ? clientFor(run.providerId ?? "pi-tmux-subagents") : undefined;
				},
				loadAgentDefaults: () => null,
				isTmuxAvailable: () => providers.length > 0,
				muxUnavailableResult: () => ({ content: [{ type: "text", text: "Workflow provider unavailable" }], details: { error: "provider unavailable" } }),
			}, { shouldRegister });
			commands = registerWorkflowCommands(pi, {
				state: gates.state,
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
				validateProvider: (snapshot) => { clientFor(snapshot.providerId ?? "pi-tmux-subagents"); },
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

	pi.on("session_start", (_event, ctx) => {
		disposeTransport();
		latestCtx = ctx;
		if (disabled) return;
		handshake = createWorkflowStartupHandshake(pi.events, {
			env: process.env,
			register,
			notify: (message) => {
				if (!registered) disabled = true;
				try { ctx.ui.notify(message, "warning"); } catch { /* closed */ }
			},
		});
		// Pi dispatches session_start sequentially. Do not hold that dispatch
		// while a later provider still needs its own session_start to attach.
		ready = handshake.start();
	});
	pi.on("before_agent_start", async () => { await ready; });
	pi.on("session_shutdown", async () => {
		try { lifecycle?.endSession(); }
		finally {
			disposeTransport();
			state = createWorkflowRunState();
			latestCtx = undefined;
		}
	});
	pi.on("session_before_tree", async (_event, ctx) => {
		await ready;
		if (!registered) return;
		gates?.startSession(ctx.sessionManager.getSessionFile());
		try { await lifecycle?.stopBeforeTree(); }
		catch (error) {
			try { ctx.ui.notify(`Tree navigation cancelled: could not stop the workflow role: ${String(error)}. Saved sessions and artifacts are preserved.`, "error"); } catch { /* fail closed even without UI */ }
			return { cancel: true };
		}
	});
	pi.on("session_tree", (_event, ctx) => {
		if (!registered) return;
		restore(ctx);
		commands?.restoreActiveRunUx(ctx);
	});
}
