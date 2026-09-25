import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

test("Pi loader binds installed entries in both orders and disables workflows without a provider", { timeout: 20_000 }, async () => {
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
		roles: [{ id: "author", label: "Author", agent: "planner", reads: [], writes: [], handoff: "Continue writing." }],
	}));
	writeFileSync(join(packageRoot, "SKILL.md"), "---\nname: docs-review\ndescription: Loader fixture\ndisable-model-invocation: true\n---\nWrite the requested guide.");
	const model: any = { provider: "workflow-test", id: "echo", name: "Echo", api: "anthropic-messages",
		baseUrl: "https://unused.test", reasoning: false, input: ["text"], contextWindow: 100000, maxTokens: 1000,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
	const installed = join(homedir(), ".pi/agent/extensions");
	const local = dirname(dirname(fileURLToPath(import.meta.url)));
	const entry = (name: string) => {
		const path = join(installed, name, "index.ts");
		return existsSync(path) ? path : join(local, name, "index.ts");
	};
	try {
		for (const order of [
			["pi-tmux-subagents", "pi-workflows"], ["pi-workflows", "pi-tmux-subagents"], ["pi-workflows"],
		]) {
			const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
			const resourceLoader = new DefaultResourceLoader({
				cwd: root, agentDir: root, settingsManager,
				noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
				additionalExtensionPaths: order.map(entry),
				extensionFactories: [(pi) => pi.registerProvider("workflow-test", {
					api: "anthropic-messages", baseUrl: "https://unused.test", apiKey: "test-only", models: [model],
				})],
			});
			await resourceLoader.reload();
			assert.deepEqual(resourceLoader.getExtensions().errors, []);
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
				const compatible = order.length > 1;
				assert.equal(commands.filter((name) => name === "workflow").length, compatible ? 1 : 0);
				assert.equal(commands.filter((name) => name === "peter").length, compatible ? 1 : 0);
				assert.equal(session.getActiveToolNames().includes("workflow_spawn"), compatible);
				if (compatible) {
					await session.prompt("/workflow list");
					assert.match(notices.join("\n"), /peter/);
					await workflowPrompt("/peter Installed fresh run.");
					await session.prompt("/workflow status");
					assert.match(notices.at(-1) ?? "", /peter/);
					await workflowPrompt("/workflow run docs-review Installed synthetic run.");
					const snapshots = session.sessionManager.getBranch().filter((entry: any) =>
						entry.type === "custom" && entry.customType === "pi-tmux-subagents.workflow-run");
					const historical: any = structuredClone((snapshots.at(-1) as any).data);
					assert.equal(historical.workflowId, "docs-review");
					delete historical.providerId;
					session.sessionManager.appendCustomEntry("pi-tmux-subagents.workflow-run", historical);
					await session.extensionRunner.emit({ type: "session_shutdown", reason: "reload" });
					await session.bindExtensions({ uiContext: ui });
					await session.extensionRunner.emit({ type: "before_agent_start", prompt: "", systemPrompt: "" } as any);
					await session.prompt("/workflow status");
					assert.match(notices.at(-1) ?? "", /docs-review/);
					await workflowPrompt("/workflow-resume Installed historical run.");
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
