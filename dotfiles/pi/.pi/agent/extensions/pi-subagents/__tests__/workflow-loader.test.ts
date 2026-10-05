import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

test("Pi loader uses one subagents entry for source and installed workflows and preserves session boundaries", { timeout: 20_000 }, async () => {
	const root = mkdtempSync(join(tmpdir(), "workflow-installed-"));
	const names = ["PI_SUBAGENT_ID", "PI_SUBAGENT_SESSION", "PI_SUBAGENT_NAME", "PI_SUBAGENT_AGENT", "PI_DENY_TOOLS", "TMUX", "PI_CODING_AGENT_DIR"];
	const old = names.map((name) => process.env[name]);
	for (const name of names) delete process.env[name];
	process.env.TMUX = "loader-test"; // Discovery only: no pane is spawned.
	process.env.PI_CODING_AGENT_DIR = root;
	const packageRoot = join(root, "workflows/docs-review");
	mkdirSync(packageRoot, { recursive: true });
	writeFileSync(join(packageRoot, "workflow.json"), JSON.stringify({
		version: 1, id: "docs-review", command: { name: "docs", description: "Review documentation" }, skill: "SKILL.md", data: {},
		roles: [{ id: "author", label: "Author", agent: "planner", reads: [], handoff: "Continue writing." }],
	}));
	writeFileSync(join(packageRoot, "SKILL.md"), "---\nname: docs-review\ndescription: Loader fixture\ndisable-model-invocation: true\n---\nWrite the requested guide.");
	const model: any = { provider: "workflow-test", id: "echo", name: "Echo", api: "anthropic-messages",
		baseUrl: "https://unused.test", reasoning: false, input: ["text"], contextWindow: 100000, maxTokens: 1000,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
	const installed = join(root, "extensions");
	const local = dirname(dirname(fileURLToPath(import.meta.url)));
	mkdirSync(installed);
	symlinkSync(local, join(installed, "pi-subagents"), "dir");
	try {
		for (const scenario of [
			{ installed: false, provider: true, child: false },
			{ installed: true, provider: true, child: false },
			{ installed: true, provider: false, child: false },
			{ installed: true, provider: true, child: true },
		]) {
			if (scenario.provider) process.env.TMUX = "loader-test";
			else delete process.env.TMUX;
			if (scenario.child) process.env.PI_SUBAGENT_ID = "loader-child";
			else delete process.env.PI_SUBAGENT_ID;
			const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
			const resourceLoader = new DefaultResourceLoader({
				cwd: root, agentDir: root, settingsManager,
				noExtensions: !scenario.installed, noSkills: true, noPromptTemplates: true, noThemes: true,
				additionalExtensionPaths: scenario.installed ? [] : [join(local, "index.ts")],
				extensionFactories: [(pi) => pi.registerProvider("workflow-test", {
					api: "anthropic-messages", baseUrl: "https://unused.test", apiKey: "test-only", models: [model],
				})],
			});
			await resourceLoader.reload();
			assert.deepEqual(resourceLoader.getExtensions().errors, []);
			assert.equal(resourceLoader.getExtensions().extensions.filter((extension) =>
				extension.path.endsWith("/pi-subagents/index.ts")).length, 1);
			assert.equal(resourceLoader.getExtensions().extensions.some((extension) =>
				extension.path.includes("/pi-workflows/")), false);
			const modelRuntime = await ModelRuntime.create({
				authPath: join(root, "auth.json"), modelsPath: join(root, "models.json"), modelsStorePath: join(root, "models-store.json"),
			});
			const { session } = await createAgentSession({
				cwd: root, agentDir: root, settingsManager, resourceLoader, modelRuntime, model,
				sessionManager: SessionManager.create(root, join(root, "sessions")), noTools: "builtin",
			});
			const notices: string[] = [];
			const ui: any = { notify: (message: string) => notices.push(message), confirm: async () => true,
				select: async (_title: string, choices: string[]) => choices[0], setWidget() {} };
			session.agent.streamFunction = () => {
				const stream = createAssistantMessageEventStream();
				const message: any = { role: "assistant", content: [{ type: "text", text: "Fixture acknowledgement." }],
					api: "anthropic-messages", provider: "workflow-test", model: "echo", stopReason: "stop", timestamp: Date.now(),
					usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: model.cost } };
				stream.push({ type: "done", reason: "stop", message });
				return stream;
			};
			async function workflowPrompt(text: string) {
				let off: () => void = () => {};
				let timer: ReturnType<typeof setTimeout>;
				const settled = new Promise<void>((resolve) => {
					off = session.subscribe((event) => { if (event.type === "agent_settled") resolve(); });
				});
				try {
					await session.prompt(text);
					await Promise.race([settled, new Promise<void>((_resolve, reject) => {
						timer = setTimeout(() => reject(new Error(`${text}: ${notices.slice(-3).join("\n")}`)), 2_000);
					})]);
				} finally { off(); clearTimeout(timer!); }
			}
			try {
				await session.bindExtensions({ uiContext: ui });
				// Wait for the coordinator's bounded handshake, not for any child process.
				await session.extensionRunner.emit({ type: "before_agent_start", prompt: "", systemPrompt: "" } as any);
				const commands = session.extensionRunner.getRegisteredCommands().map((command) => command.name);
				const compatible = scenario.provider && !scenario.child;
				assert.equal(commands.filter((name) => name === "workflow").length, compatible ? 1 : 0);
				assert.equal(commands.filter((name) => name === "peter").length, compatible ? 1 : 0);
				const activeTools = session.getActiveToolNames();
				assert.equal(activeTools.filter((name) => name === "Agent").length, 1);
				for (const name of ["workflow_spawn", "workflow_resume", "workflow_recover", "workflow_gate", "workflow_complete"]) {
					assert.equal(activeTools.filter((tool) => tool === name).length, compatible ? 1 : 0);
				}
				if (compatible) {
					await session.prompt("/workflow list");
					assert.match(notices.join("\n"), /peter/);
					await workflowPrompt("/peter Installed fresh run.");
					await session.prompt("/workflow status");
					assert.match(notices.at(-1) ?? "", /peter/);
					await workflowPrompt("/workflow run docs-review Installed synthetic run.");
					const snapshots = session.sessionManager.getBranch().filter((entry: any) =>
						entry.type === "custom" && entry.customType === "pi-agent-teams.workflow-run");
					const historical: any = structuredClone((snapshots.at(-1) as any).data);
					assert.equal(historical.workflowId, "docs-review");
					assert.equal(historical.providerId, "pi-agent-teams");
					delete historical.providerId;
					// Saved package paths can refer to the removed wrapper layout.
					historical.packagePath = join(root, "extensions", "pi-subagents", "pi-workflows", "workflows", "docs-review");
					historical.definition.packagePath = historical.packagePath;
					historical.definition.manifestPath = join(historical.packagePath, "workflow.json");
					historical.definition.skillPath = join(historical.packagePath, "SKILL.md");
					historical.definition.skill.path = historical.definition.skillPath;
					assert.equal(existsSync(historical.packagePath), false);
					session.sessionManager.appendCustomEntry("pi-agent-teams.workflow-run", historical);
					await session.extensionRunner.emit({ type: "session_shutdown", reason: "reload" });
					await session.bindExtensions({ uiContext: ui });
					await session.extensionRunner.emit({ type: "before_agent_start", prompt: "", systemPrompt: "" } as any);
					assert.equal(session.extensionRunner.getRegisteredCommands().filter((command) => command.name === "workflow").length, 1);
					assert.equal(session.getActiveToolNames().filter((name) => name === "workflow_spawn").length, 1);
					await session.prompt("/workflow status");
					assert.match(notices.at(-1) ?? "", /docs-review/);
					await workflowPrompt("/workflow-resume Installed historical run.");
					const restored = session.sessionManager.getBranch().filter((entry: any) =>
						entry.type === "custom" && entry.customType === "pi-agent-teams.workflow-run");
					assert.equal((restored.at(-1) as any).data.packagePath, historical.packagePath);
				}
			} finally {
				await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
				session.dispose();
			}
		}
	} finally {
		names.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i]; });
		rmSync(root, { recursive: true, force: true });
	}
});
