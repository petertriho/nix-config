import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import {
	createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import piWorkflows from "./helpers/workflow.ts";
import { MODEL, savedRun, withParent } from "./helpers/workflow.ts";
import { getActiveWorkflowRun, restoreWorkflowRunStateFromSession } from "../workflow/state.ts";
import {
	WORKFLOW_PROVIDER_CAPABILITIES, WORKFLOW_PROVIDER_DISCOVER_CHANNEL, WORKFLOW_PROVIDER_REQUEST_CHANNEL,
	type WorkflowProviderRequest,
} from "../adapters/workflow-contract.ts";

for (const boundary of ["confirmation", "startup"] as const) {
	for (const returnToA of [false, true]) {
		test(`SDK navigation during replacement ${boundary} invalidates approval${returnToA ? " even after returning to A" : " for A before restoring B"}`,
			{ timeout: 10_000 }, async () => {
				await withParent(async (root) => {
					const manager = SessionManager.create(root, join(root, "sessions"));
					const base = manager.appendCustomEntry("test-root", {});
					const entryA = manager.appendCustomEntry("pi-agent-teams.workflow-run", savedRun(root, "run-a"));
					manager.branch(base);
					const entryB = manager.appendCustomEntry("pi-agent-teams.workflow-run", savedRun(root, "run-b"));
					manager.branch(entryA);
					const sessionId = manager.getSessionId();
					const settingsManager = SettingsManager.inMemory({
						compaction: { enabled: false }, retry: { enabled: false },
					});
					const requests: WorkflowProviderRequest[] = [];
					const resourceLoader = new DefaultResourceLoader({
						cwd: root, agentDir: join(root, "agent"), settingsManager,
						noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
						extensionFactories: [
							piWorkflows,
							(pi) => {
								pi.registerProvider("workflow-test", {
									api: "anthropic-messages", baseUrl: "https://unused.test", apiKey: "test-only",
									models: [{ ...MODEL, provider: "workflow-test" } as any],
								});
								const detach: Array<() => void> = [];
								pi.on("session_start", () => {
									detach.push(pi.events.on(WORKFLOW_PROVIDER_DISCOVER_CHANNEL, (request: any) => {
										pi.events.emit(`${WORKFLOW_PROVIDER_DISCOVER_CHANNEL}:reply:${request.requestId}`, {
											requestId: request.requestId, providerId: "pi-agent-teams", instanceId: "test",
											version: 1, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
										});
									}));
									detach.push(pi.events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
										const request = value as WorkflowProviderRequest;
										requests.push(request);
										const payload = request.payload as { requiredAgents?: string[] };
										const data = request.operation === "ping" ? { alive: true }
											: request.operation === "profiles" ? {
												profiles: payload.requiredAgents!.map((agentId) => ({
													agentId, path: `/profiles/${agentId}.md`, hash: "hash",
												})),
											} : { stopped: true };
										pi.events.emit(`pi-workflows:provider:reply:${request.requestId}`, { ...request, ok: true, data });
									}));
								});
								pi.on("session_shutdown", () => { detach.forEach((off) => off()); });
							},
						],
					});
					await resourceLoader.reload();
					assert.deepEqual(resourceLoader.getExtensions().errors, []);
					const modelRuntime = await ModelRuntime.create({
						authPath: join(root, "auth.json"), modelsPath: join(root, "models.json"),
						modelsStorePath: join(root, "models-store.json"),
					});
					const { session } = await createAgentSession({
						cwd: root, agentDir: join(root, "agent"), settingsManager, resourceLoader, modelRuntime,
						model: { ...MODEL, provider: "workflow-test" } as any, sessionManager: manager, noTools: "builtin",
					});
					// A regression must not make an external model request.
					let modelCalls = 0;
					session.agent.streamFunction = () => {
						modelCalls++;
						const stream = createAssistantMessageEventStream();
						stream.push({ type: "done", reason: "stop", message: {
							role: "assistant", content: [], api: "anthropic-messages", provider: "workflow-test", model: MODEL.id,
							stopReason: "stop", timestamp: Date.now(),
							usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
						} });
						return stream;
					};
					let entered!: () => void;
					let release!: () => void;
					const waiting = new Promise<void>((resolve) => { entered = resolve; });
					const answer = new Promise<void>((resolve) => { release = resolve; });
					const notices: string[] = [];
					const pauseAt = async (stage: typeof boundary) => {
						if (stage !== boundary) return;
						entered();
						await answer;
					};
					const ui: any = {
						notify: (message: string) => notices.push(message),
						setWidget() {}, setStatus() {},
						confirm: async (_title: string, message: string) => {
							assert.match(message, /run-a/);
							await pauseAt("confirmation");
							return true;
						},
						select: async (_title: string, choices: string[]) => {
							await pauseAt("startup");
							return choices[0];
						},
					};
					let pending: Promise<void> | undefined;
					try {
						await session.bindExtensions({ uiContext: ui });
						await session.extensionRunner.emit({ type: "before_agent_start", prompt: "", systemPrompt: "" } as any);
						assert.ok(session.extensionRunner.getRegisteredCommands().some((command) => command.name === "workflow"), notices.join("\n"));
						pending = session.prompt("/workflow run docs-review Replace A only.");
						await Promise.race([waiting, pending.then(() => {
							throw new Error(`Command returned before ${boundary}: ${notices.join("\n")}`);
						})]);
						assert.equal(session.isStreaming, false, "a dialog does not block SDK navigation");
						assert.equal((await session.navigateTree(entryB)).cancelled, false);
						if (returnToA) assert.equal((await session.navigateTree(entryA)).cancelled, false);
						assert.equal(manager.getSessionId(), sessionId, "navigation stays in the same session");
						const before = manager.getEntries().length;
						const branchBefore = manager.getBranch();
						const stopsBefore = requests.filter((request) => request.operation === "stop").length;
						release();
						await pending;
						assert.equal(manager.getEntries().length, before, "stale approval must not append a replacement");
						assert.deepEqual(manager.getBranch(), branchBefore);
						assert.equal(getActiveWorkflowRun(restoreWorkflowRunStateFromSession(manager).state)?.runId,
							returnToA ? "run-a" : "run-b");
						assert.equal(requests.filter((request) => request.operation === "stop").length, stopsBefore);
						assert.equal(modelCalls, 0);
						assert.match(notices.at(-1) ?? "", /active workflow or session branch changed/);
						await session.prompt("/workflow status");
						assert.match(notices.at(-1) ?? "", new RegExp(returnToA ? "run-a" : "run-b"));
					} finally {
						release();
						await pending?.catch(() => {});
						await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
						session.dispose();
					}
				});
			});
	}
}
