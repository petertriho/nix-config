import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	fingerprintStrings, hashText, readLaunchProfile, updateLaunchProfile, writeLaunchProfile,
	type LaunchProfileWorkflowMetadata, type ModelSelection,
} from "../../execution/launch-profile.ts";
import { createWorkflowEventClient } from "../../adapters/workflow-client.ts";
import {
	WORKFLOW_PROVIDER_DELIVERY_CHANNEL, WORKFLOW_PROVIDER_REQUEST_CHANNEL,
	type WorkflowEventBus, type WorkflowProviderDelivery, type WorkflowProviderRequest,
} from "../../adapters/workflow-contract.ts";
import {
	attachTmuxWorkflowProvider, tmuxWorkflowProviderIO, type TmuxWorkflowProviderDependencies,
} from "../../adapters/workflow-provider.ts";
import { createStatusState } from "../../telemetry/status.ts";
import type { ResumeLifecycleContext, SubagentResult } from "../../subagent-services.ts";

type Services = TmuxWorkflowProviderDependencies["services"];
type ProfileIdentity = NonNullable<ReturnType<TmuxWorkflowProviderDependencies["resolveProfile"]>>;
type DeliveryEnvelope = WorkflowProviderDelivery
	& Pick<WorkflowProviderRequest, "requestId" | "providerId" | "instanceId" | "owner">;
type ResumeCall = {
	params: Parameters<Services["executeSubagentResume"]>[1];
	recovery: Parameters<Services["executeSubagentResume"]>[3];
	lifecycle: ResumeLifecycleContext;
	running: Awaited<ReturnType<Services["launchSubagent"]>>;
	selection: ModelSelection;
};

/**
 * Fake only child I/O. The actual provider checks disk sidecars, repository,
 * selected models and both rollover links before the actual client gets a lease.
 */
export class FakeWorkflowProviderExecution implements Services {
	readonly root: string;
	readonly profiles = new Map<string, ProfileIdentity>();
	readonly bodies = new Map<string, string>();
	readonly stopped: string[] = [];
	profileError?: Error;
	resumeError?: Error;
	contextFacts?: { tokens: number; source: string };
	settleWatchOnAbort = true;
	launch?: {
		params: Parameters<Services["launchSubagent"]>[0];
		options: NonNullable<Parameters<Services["launchSubagent"]>[2]>;
	};
	watch?: {
		running: Awaited<ReturnType<Services["launchSubagent"]>>;
		signal: AbortSignal;
		resolve(result: SubagentResult): void;
		reject(error: Error): void;
	};
	resume?: ResumeCall;
	nextSessionPath: string;
	replacementSessionPath?: string;
	/** Negative tests omit one durable link, not a provider/client check. */
	omitLineage?: "from" | "to";

	constructor(root: string, agents: Record<string, string>) {
		this.root = root;
		this.nextSessionPath = join(root, "child.jsonl");
		for (const [agentId, body] of Object.entries(agents)) {
			const path = join(root, ".pi", "agents", `${agentId}.md`);
			const text = `---\nname: ${agentId}\nauto-exit: true\n---\n${body}\n`;
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, text);
			this.profiles.set(agentId, { agentId, path, hash: hashText(text), roleBodyHash: hashText(body) });
			this.bodies.set(agentId, body);
		}
	}

	writeSession(input: {
		sessionPath: string;
		agentId: string;
		name: string;
		workflow: LaunchProfileWorkflowMetadata;
		model: ModelSelection;
	}): void {
		const agent = this.profiles.get(input.agentId);
		assert.ok(agent, `unknown fake agent ${input.agentId}`);
		mkdirSync(dirname(input.sessionPath), { recursive: true });
		writeFileSync(input.sessionPath, `${JSON.stringify({ type: "session", version: 3, id: input.name,
			cwd: this.root, timestamp: "2026-09-01T12:00:00.000Z" })}\n`);
		writeLaunchProfile(input.sessionPath, {
			version: 1,
			stable: {
				agentName: input.agentId, displayName: input.name,
				roleBody: this.bodies.get(input.agentId)!, roleBodyHash: agent.roleBodyHash,
				systemPromptMode: "append", cwd: this.root, agentDir: join(this.root, ".pi"),
				controls: { denyTools: [], autoExit: true, interactive: false, sessionMode: "standalone" },
				originalSessionPath: input.sessionPath, createdAt: "2026-09-01T12:00:00.000Z",
			},
			runtime: { originalModel: input.model, lastModel: input.model, resumeCount: 0 },
			resources: {
				tools: fingerprintStrings([]), visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-09-01T12:00:00.000Z",
			},
			workflow: input.workflow,
		});
	}

	async launchSubagent(...[params, _ctx, options]: Parameters<Services["launchSubagent"]>) {
		assert.ok(options?.workflow);
		assert.ok(options.resolvedModel);
		this.launch = { params, options };
		options.beforeLaunch?.(this.root);
		this.writeSession({
			sessionPath: this.nextSessionPath, agentId: params.agent!, name: params.name,
			workflow: options.workflow, model: options.resolvedModel.selection,
		});
		return this.running(this.nextSessionPath, params.name, params.task, params.agent);
	}

	async watchSubagent(...[running, signal]: Parameters<Services["watchSubagent"]>) {
		return new Promise<SubagentResult>((resolve, reject) => {
			this.watch = { running, signal, resolve, reject };
			if (this.settleWatchOnAbort) signal.addEventListener("abort", () => resolve({
					name: running.name, task: running.task, summary: "Stopped",
					sessionFile: running.sessionFile, exitCode: 1, elapsed: 0,
				}), { once: true });
		});
	}

	stopSubagent(...[running]: Parameters<Services["stopSubagent"]>): void {
		this.stopped.push(running.sessionFile);
		running.surfaceClosed = true;
	}

	async executeSubagentResume(...[_pi, params, ctx, recovery, lifecycle]: Parameters<Services["executeSubagentResume"]>) {
		if (this.resumeError) throw this.resumeError;
		assert.ok(lifecycle?.workflowMetadata);
		const read = readLaunchProfile(params.sessionPath);
		assert.equal(read.status, "ok");
		if (read.status !== "ok") throw new Error("saved fake session unavailable");
		const saved = read.profile;
		assert.ok(saved.stable.agentName);
		let selection = saved.runtime.lastModel ?? saved.runtime.originalModel;
		assert.ok(selection);
		if (params.model && params.model !== "previous") {
			assert.notEqual(params.model, "pick", "the event tools, not this service, select recovery models");
			const [provider, id] = params.model.split("/");
			const [model, thinking] = id.split(":");
			selection = { provider, model, ...(thinking ? { thinking: thinking as ModelSelection["thinking"] } : {}) };
		}
		assert.ok(ctx.modelRegistry?.getAvailable().some((model) => model.provider === selection.provider && model.id === selection.model));
		lifecycle.beforeLaunch?.(saved.stable.cwd, params.sessionPath);
		const sessionPath = this.replacementSessionPath ?? params.sessionPath;
		const replacement = sessionPath !== params.sessionPath;
		const name = params.name ?? saved.stable.displayName ?? saved.stable.agentName;
		const workflow = { ...lifecycle.workflowMetadata, currentDefault: selection };
		if (replacement) {
			this.writeSession({
				sessionPath, agentId: saved.stable.agentName, name,
				workflow, model: selection,
			});
			if (this.omitLineage !== "from") updateLaunchProfile(sessionPath, (profile) => ({
				...profile, lineage: { ...profile.lineage, rolledOverFrom: params.sessionPath },
			}));
			if (this.omitLineage !== "to") updateLaunchProfile(params.sessionPath, (profile) => ({
				...profile, lineage: { ...profile.lineage, rolledOverTo: sessionPath },
			}));
		} else {
			updateLaunchProfile(sessionPath, (profile) => ({
				...profile, workflow, runtime: { ...profile.runtime, lastModel: selection },
			}));
		}
		const running = this.running(sessionPath, name, params.message ?? "Resume", saved.stable.agentName);
		this.resume = { params, recovery, lifecycle, running, selection };
		await lifecycle.onLaunched?.({
			running, selection, replacement, originalSessionPath: params.sessionPath, sessionPath,
		});
		return {
			content: [{ type: "text" as const, text: "Resume started" }],
			details: { status: "started", sessionPath,
				...(replacement ? { rollover: "fresh", replacementSessionPath: sessionPath } : {}) },
		};
	}

	async successfulResponse(selection = this.resume?.selection): Promise<void> {
		assert.ok(selection);
		await this.resume?.recovery?.onSuccessfulResponse?.(selection);
	}

	async completeResume(result: SubagentResult): Promise<void> {
		assert.ok(this.resume);
		const { lifecycle, params, running } = this.resume;
		running.surfaceClosed = true;
		await lifecycle.onResult?.({
			result, replacement: running.sessionFile !== params.sessionPath,
			originalSessionPath: params.sessionPath, sessionPath: running.sessionFile,
		});
	}

	private running(sessionFile: string, name: string, task: string, agent: string | undefined) {
		return {
			id: sessionFile, name, task, agent, surface: `%${sessionFile}`,
			startTime: 0, sessionFile, launchScriptFile: join(this.root, "launch.sh"),
			statusState: createStatusState({ source: "pi", startTimeMs: 0 }), interactive: false,
			surfaceClosed: false,
		};
	}
}

export function createWorkflowEventExecutionFixture(
	execution: FakeWorkflowProviderExecution,
	ctx: TmuxWorkflowProviderDependencies["ctx"],
	pi: TmuxWorkflowProviderDependencies["pi"],
) {
	const handlers = new Map<string, Set<(value: unknown) => void>>();
	const requests: WorkflowProviderRequest[] = [];
	const deliveries: DeliveryEnvelope[] = [];
	let available = true;
	const events: WorkflowEventBus = {
		on(channel, handler) {
			const group = handlers.get(channel) ?? new Set();
			group.add(handler);
			handlers.set(channel, group);
			return () => group.delete(handler);
		},
		emit(channel, value) {
			if (channel === WORKFLOW_PROVIDER_REQUEST_CHANNEL) requests.push(value as WorkflowProviderRequest);
			if (channel === WORKFLOW_PROVIDER_DELIVERY_CHANNEL) deliveries.push(value as DeliveryEnvelope);
			for (const handler of [...(handlers.get(channel) ?? [])]) handler(value);
		},
	};
	const io = tmuxWorkflowProviderIO();
	const attached = attachTmuxWorkflowProvider({
		...io, events, ctx, pi, services: execution,
		sessionId: ctx.sessionManager.getSessionId(), isAvailable: () => available,
		resolveProfile: (id) => {
			if (execution.profileError) throw execution.profileError;
			const profile = execution.profiles.get(id);
			return profile ? io.resolveFile(id, profile.path, execution.bodies.get(id)!) : null;
		},
		estimateContext: (path) => execution.contextFacts ?? io.estimateContext(path),
		refresh: { start() {}, update() {} },
	});
	assert.ok(attached);
	const client = createWorkflowEventClient(events, attached.identity);
	return {
		events, requests, deliveries, client,
		setAvailable(value: boolean) { available = value; },
		dispose() { client.dispose(); attached.detach(); },
	};
}
