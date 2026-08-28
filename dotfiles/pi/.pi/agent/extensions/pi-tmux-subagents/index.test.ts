import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { getSubagentActivityFile } from "./activity.ts";
import piTmuxSubagents, { __test__ as testApi } from "./index.ts";
import {
	classifyStatus,
	createStatusState,
	formatStatusAggregate,
	formatTransitionLine,
	observeStatus,
} from "./status.ts";

type AnyRecord = Record<string, any>;

function createMockExtensionApi(options: { env?: Record<string, string> } = {}) {
	const registeredTools: AnyRecord[] = [];
	const registeredCommands: AnyRecord[] = [];
	const registeredMessageRenderers: AnyRecord[] = [];
	const sentUserMessages: string[] = [];
	const sentMessages: AnyRecord[] = [];
	const api = {
		on() {},
		registerTool(tool: AnyRecord) {
			registeredTools.push(tool);
		},
		registerCommand(name: string, command: AnyRecord) {
			registeredCommands.push({ name, ...command });
		},
		registerMessageRenderer(name: string, renderer: AnyRecord) {
			registeredMessageRenderers.push({ name, renderer });
		},
		registerShortcut() {},
		sendUserMessage(message: string) {
			sentUserMessages.push(message);
		},
		sendMessage(message: AnyRecord, options?: AnyRecord) {
			sentMessages.push({ message, options });
		},
		getAllTools() {
			return [];
		},
	};
	// Scrub ambient PI_* vars (e.g. a subagent harness exporting PI_DENY_TOOLS) around the
	// synchronous registration call so every invocation path sees the same env; restore
	// afterwards so execute()-time readers still observe what each test arranged.
	const ambient = Object.keys(process.env).filter((key) => key.startsWith("PI_"));
	const saved = Object.fromEntries(ambient.map((key) => [key, process.env[key]!]));
	for (const key of ambient) delete process.env[key];
	for (const [key, value] of Object.entries(options.env ?? {})) process.env[key] = value;

	try {
		piTmuxSubagents(api as any);
	} finally {
		const touched = new Set([...ambient, ...Object.keys(options.env ?? {})]);
		for (const key of touched) restoreEnvVar(key, saved[key]);
	}
	return { api, registeredTools, registeredCommands, registeredMessageRenderers, sentUserMessages, sentMessages };
}

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

function markerTheme(marker = "theme") {
	const mark = (kind: string, token: string, text: string) =>
		`\x1b]9;${marker}:${kind}:${token}\x07${text}\x1b]9;end\x07`;
	return {
		fg: (token: string, text: string) => mark("fg", token, text),
		bg: (token: string, text: string) => mark("bg", token, text),
		bold: (text: string) => mark("style", "bold", text),
	};
}

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-index-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function writeAgentFile(agentsDir: string, name: string, frontmatter: string, body = "You are a test agent."): void {
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(join(agentsDir, `${name}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
}

function restoreEnvVar(name: string, value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

async function withIsolatedAgentEnv(
	fn: (paths: { projectAgentsDir: string; globalAgentsDir: string }) => Promise<void> | void,
): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-agents-"));
	const previousCwd = process.cwd();
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const projectDir = join(root, "project");
	const projectAgentsDir = join(projectDir, ".pi", "agents");
	const globalAgentsDir = join(root, "global", "agents");
	mkdirSync(projectAgentsDir, { recursive: true });
	mkdirSync(globalAgentsDir, { recursive: true });
	process.chdir(projectDir);
	process.env.PI_CODING_AGENT_DIR = join(root, "global");
	try {
		await fn({ projectAgentsDir, globalAgentsDir });
	} finally {
		process.chdir(previousCwd);
		restoreEnvVar("PI_CODING_AGENT_DIR", previousAgentDir);
		rmSync(root, { recursive: true, force: true });
	}
}

function withMockedNow<T>(now: number, fn: () => T): T {
	const originalNow = Date.now;
	Date.now = () => now;
	try {
		return fn();
	} finally {
		Date.now = originalNow;
	}
}

function makeRunning(overrides: AnyRecord = {}) {
	return {
		id: "a1",
		name: "Worker",
		task: "",
		surface: "%1",
		startTime: 0,
		sessionFile: "worker.jsonl",
		interactive: false,
		statusState: createStatusState({ source: "pi", startTimeMs: 0 }),
		...overrides,
	};
}

const activeAt5 = {
	snapshot: "present" as const,
	updatedAt: 5_000,
	sequence: 1,
	phase: "active" as const,
	active: true,
	activeScope: "tool",
	activeSince: 5_000,
	activityLabel: "bash",
};

// ── agent parsing and discovery ──

test("parseAgentDefinition reads frontmatter fields and the body", () => {
	const parsed = testApi.parseAgentDefinition(
		[
			"---",
			"name: demo",
			"description: Demo agent",
			"tools: read, bash",
			"skills: planner",
			"auto-exit: false",
			"interactive: true",
			"spawning: false",
			"system-prompt: append",
			"session-mode: lineage-only",
			"deny-tools: claude",
			"---",
			"",
			"Body text.",
		].join("\n"),
		"fallback",
	);
	assert.ok(parsed);
	assert.equal(parsed.name, "demo");
	assert.equal(parsed.description, "Demo agent");
	assert.equal(parsed.tools, "read, bash");
	assert.equal(parsed.skills, "planner");
	assert.equal(parsed.autoExit, false);
	assert.equal(parsed.interactive, true);
	assert.equal(parsed.spawning, false);
	assert.equal(parsed.systemPromptMode, "append");
	assert.equal(parsed.sessionMode, "lineage-only");
	assert.equal(parsed.denyTools, "claude");
	assert.equal(parsed.body, "Body text.");
	assert.equal(parsed.disableModelInvocation, false);
	assert.equal(testApi.parseAgentDefinition("no frontmatter", "x"), null);
});

test("loadAgentDefaults reads session-mode, interactive flags, and ignores invalid modes", async () => {
	await withIsolatedAgentEnv(({ projectAgentsDir }) => {
		writeAgentFile(projectAgentsDir, "lineage-agent", "name: lineage-agent\nsession-mode: lineage-only");
		writeAgentFile(projectAgentsDir, "interactive-true", "name: interactive-true\ninteractive: true");
		writeAgentFile(projectAgentsDir, "interactive-false", "name: interactive-false\ninteractive: false");
		writeAgentFile(projectAgentsDir, "interactive-unset", "name: interactive-unset");
		writeAgentFile(projectAgentsDir, "invalid-mode", "name: invalid-mode\nsession-mode: sideways");

		assert.equal(testApi.loadAgentDefaults("lineage-agent")?.sessionMode, "lineage-only");
		assert.equal(testApi.loadAgentDefaults("interactive-true")?.interactive, true);
		assert.equal(testApi.loadAgentDefaults("interactive-false")?.interactive, false);
		assert.equal(testApi.loadAgentDefaults("interactive-unset")?.interactive, undefined);
		assert.equal(testApi.loadAgentDefaults("invalid-mode")?.sessionMode, undefined);
		assert.equal(testApi.loadAgentDefaults("does-not-exist"), null);
	});
});

test("project agents override global agents with the same name", async () => {
	await withIsolatedAgentEnv(({ projectAgentsDir, globalAgentsDir }) => {
		writeAgentFile(globalAgentsDir, "shared", "name: shared\nmodel: global/model", "Global body.");
		writeAgentFile(projectAgentsDir, "shared", "name: shared\nmodel: project/model", "Project body.");
		const loaded = testApi.loadAgentDefaults("shared");
		assert.equal(loaded?.model, "project/model");
		assert.equal(loaded?.body, "Project body.");
		const listed = testApi.discoverAgentDefinitions().find((agent) => agent.name === "shared");
		assert.equal(listed?.source, "project");
	});
});

test("resolveEffectiveInteractive defaults to the inverse of auto-exit and honors overrides", () => {
	const params = { name: "A", task: "T" };
	assert.equal(testApi.resolveEffectiveInteractive(params, { autoExit: true }), false);
	assert.equal(testApi.resolveEffectiveInteractive(params, { autoExit: false }), true);
	assert.equal(testApi.resolveEffectiveInteractive(params, {}), true);
	assert.equal(testApi.resolveEffectiveInteractive(params, null), true);
	assert.equal(testApi.resolveEffectiveInteractive(params, { autoExit: true, interactive: true }), true);
	assert.equal(testApi.resolveEffectiveInteractive(params, { interactive: false }), false);
	assert.equal(
		testApi.resolveEffectiveInteractive({ ...params, interactive: false }, { autoExit: false, interactive: true }),
		false,
	);
	assert.equal(
		testApi.resolveEffectiveInteractive({ ...params, interactive: true }, { autoExit: true, interactive: false }),
		true,
	);
});

test("resolveEffectiveSessionMode and resolveLaunchBehavior honor fork precedence", () => {
	const params = { name: "A", task: "T" };
	assert.equal(testApi.resolveEffectiveSessionMode(params, null), "standalone");
	assert.equal(testApi.resolveEffectiveSessionMode(params, { sessionMode: "lineage-only" }), "lineage-only");
	assert.equal(testApi.resolveEffectiveSessionMode({ ...params, fork: true }, { sessionMode: "lineage-only" }), "fork");

	assert.deepEqual(testApi.resolveLaunchBehavior(params, null), {
		sessionMode: "standalone",
		seededSessionMode: null,
		inheritsConversationContext: false,
		taskDelivery: "artifact",
	});
	assert.deepEqual(testApi.resolveLaunchBehavior(params, { sessionMode: "lineage-only" }), {
		sessionMode: "lineage-only",
		seededSessionMode: "lineage-only",
		inheritsConversationContext: false,
		taskDelivery: "artifact",
	});
	assert.deepEqual(testApi.resolveLaunchBehavior({ ...params, fork: true }, { sessionMode: "lineage-only" }), {
		sessionMode: "fork",
		seededSessionMode: "fork",
		inheritsConversationContext: true,
		taskDelivery: "direct",
	});
});

test("resolveDenyTools expands spawning false and merges deny-tools", () => {
	const denied = testApi.resolveDenyTools({ spawning: false, denyTools: "claude, web_search" });
	for (const tool of ["subagent", "subagent_interrupt", "subagents_list", "subagent_resume", "claude", "web_search"]) {
		assert.equal(denied.has(tool), true, tool);
	}
	assert.equal(testApi.resolveDenyTools(null).size, 0);
	assert.equal(testApi.resolveDenyTools({ spawning: true }).size, 0);
});

test("normalizeSubagentParams drops blank optional strings so agent defaults apply", () => {
	const normalized = testApi.normalizeSubagentParams({
		name: "Scout",
		task: "list files",
		agent: "scout",
		systemPrompt: "",
		model: " ",
		skills: "",
		tools: "",
		cwd: "/tmp",
		fork: false,
		interactive: false,
		resumeSessionId: "",
	});
	assert.deepEqual(normalized, {
		name: "Scout",
		task: "list files",
		agent: "scout",
		cwd: "/tmp",
		fork: false,
		interactive: false,
	});
});

test("resolvePiModelArgument applies fresh Pi model and thinking precedence", () => {
	const parent = {
		model: { provider: "openai", id: "gpt-5.4" },
		thinkingLevel: "high",
	} as const;

	assert.equal(
		testApi.resolvePiModelArgument({ name: "A", task: "T" }, null, parent),
		"openai/gpt-5.4:high",
	);
	assert.equal(
		testApi.resolvePiModelArgument(
			{ name: "A", task: "T" },
			null,
			{ model: { provider: "openrouter", id: "anthropic/claude-sonnet-4" }, thinkingLevel: "medium" },
		),
		"openrouter/anthropic/claude-sonnet-4:medium",
	);
	assert.equal(
		testApi.resolvePiModelArgument(
			{ name: "A", task: "T", model: "tool/model" },
			{ model: "agent/model", thinking: "low" },
			parent,
		),
		"tool/model:low",
	);
	assert.equal(
		testApi.resolvePiModelArgument(
			{ name: "A", task: "T" },
			{ model: "agent/model" },
			parent,
		),
		"agent/model",
	);
	assert.equal(
		testApi.resolvePiModelArgument(
			{ name: "A", task: "T" },
			{ thinking: "minimal" },
			parent,
		),
		"openai/gpt-5.4:minimal",
	);
	assert.equal(
		testApi.resolvePiModelArgument(
			{ name: "A", task: "T" },
			{ model: "agent/model", thinking: "high" },
			parent,
		),
		"agent/model:high",
	);
	assert.equal(
		testApi.resolvePiModelArgument(
			{ name: "A", task: "T" },
			null,
			{ model: undefined, thinkingLevel: "high" },
		),
		undefined,
	);
});

test("buildSubagentToolAllowlist keeps requested tools and adds child control tools", () => {
	assert.equal(
		testApi.buildSubagentToolAllowlist("read,bash,web_search"),
		"read,bash,web_search,caller_ping,subagent_done",
	);
	assert.equal(testApi.buildSubagentToolAllowlist(undefined), null);
	assert.equal(testApi.buildSubagentToolAllowlist(""), null);
});

test("buildPiPromptArgs passes the task argument through when no skills are set", () => {
	assert.deepEqual(
		testApi.buildPiPromptArgs({ effectiveSkills: undefined, taskDelivery: "artifact", taskArg: "@artifact.md", taskText: "do it" }),
		["@artifact.md"],
	);
	assert.deepEqual(
		testApi.buildPiPromptArgs({ effectiveSkills: "", taskDelivery: "direct", taskArg: "do it", taskText: "do it" }),
		["do it"],
	);
});

test("buildPiPromptArgs emits one /skill:<name> <task> argument and never an @file with skills", () => {
	const args = testApi.buildPiPromptArgs({
		effectiveSkills: "planner",
		taskDelivery: "artifact",
		taskArg: "@artifact.md",
		taskText: "Plan the thing.\n\nSecond line.",
	});
	assert.deepEqual(args, ["/skill:planner Plan the thing.\n\nSecond line."]);
	assert.equal(args.some((arg) => arg.startsWith("@")), false);
	assert.equal(args.some((arg) => arg === ""), false);
});

test("buildPiPromptArgs names additional skills inside the task text", () => {
	const [arg] = testApi.buildPiPromptArgs({
		effectiveSkills: "review, lint",
		taskDelivery: "direct",
		taskArg: "do the task",
		taskText: "do the task",
	});
	assert.match(arg, /^\/skill:review /);
	assert.match(arg, /skills from your available skills list before you start: lint\./);
	assert.match(arg, /do the task$/);
});

test("subagents_list lists visible agents, hides disable-model-invocation, and lets project shadow global", async () => {
	await withIsolatedAgentEnv(async ({ projectAgentsDir, globalAgentsDir }) => {
		writeAgentFile(projectAgentsDir, "visible-agent", "name: visible-agent\ndescription: Visible test agent");
		writeAgentFile(projectAgentsDir, "hidden-agent", "name: hidden-agent\nmodel: test/hidden\ndisable-model-invocation: true", "Hidden body.");
		writeAgentFile(globalAgentsDir, "shadowed-agent", "name: shadowed-agent\nmodel: test/global");
		writeAgentFile(projectAgentsDir, "shadowed-agent", "name: shadowed-agent\nmodel: test/project\ndisable-model-invocation: true");

		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagents_list");
		assert.ok(tool);
		const result = await tool.execute();
		const names = (result.details.agents as AnyRecord[]).map((agent) => agent.name);
		assert.ok(names.includes("visible-agent"));
		assert.match(result.content[0].text, /visible-agent \(project\) — Visible test agent/);
		assert.equal(names.includes("hidden-agent"), false);
		assert.equal(names.includes("shadowed-agent"), false);

		const hidden = testApi.loadAgentDefaults("hidden-agent");
		assert.equal(hidden?.model, "test/hidden");
		assert.equal(hidden?.body, "Hidden body.");
		assert.equal(hidden?.disableModelInvocation, true);
		assert.equal(testApi.loadAgentDefaults("shadowed-agent")?.model, "test/project");
	});
});

// ── bundled agents (T9) ──

test("bundled agents parse with the expected spawning, auto-exit, and interactive flags", () => {
	const dir = testApi.getBundledAgentsDir();
	const files = readdirSync(dir).filter((file) => file.endsWith(".md")).sort();
	assert.deepEqual(files, [
		"claude-code.md",
		"implementer.md",
		"planner.md",
		"reviewer.md",
		"scout.md",
		"task-writer.md",
		"worker.md",
	]);
	const byName = new Map(
		files.map((file) => {
			const parsed = testApi.parseAgentDefinition(readFileSync(join(dir, file), "utf8"), file.replace(/\.md$/, ""));
			assert.ok(parsed, file);
			assert.ok(parsed.description, `${file} needs a description`);
			return [parsed.name, parsed] as const;
		}),
	);
	assert.ok(byName.get("implementer")!.spawning === undefined || byName.get("implementer")!.spawning === true);
	for (const name of ["planner", "task-writer", "reviewer", "worker", "scout", "claude-code"]) {
		assert.equal(byName.get(name)!.spawning, false, name);
	}
	assert.equal(byName.get("planner")!.autoExit, false);
	assert.equal(byName.get("planner")!.interactive, true);
	assert.equal(byName.get("planner")!.skills, "planner");
	assert.equal(byName.get("task-writer")!.skills, "plan-to-tasks");
	assert.equal(byName.get("implementer")!.skills, "implement");
	assert.equal(byName.get("reviewer")!.skills, "implementation-review");
	for (const name of ["task-writer", "implementer", "reviewer", "worker", "scout"]) {
		assert.equal(byName.get(name)!.autoExit, true, name);
		assert.equal(byName.get(name)!.model, undefined, `${name} inherits the session model`);
		assert.equal(byName.get(name)!.systemPromptMode, "append", name);
	}
	assert.equal(byName.get("claude-code")!.cli, "claude");
	for (const name of ["planner", "worker", "scout", "reviewer", "task-writer", "implementer"]) {
		assert.equal(testApi.resolveEffectiveInteractive({ name, task: "" }, byName.get(name)!), name === "planner", name);
	}
});

// ── registration and commands ──

test("registers the four tools, three renderers, and the commands", () => {
	const { registeredTools, registeredCommands, registeredMessageRenderers } = createMockExtensionApi();
	assert.deepEqual(
		registeredTools.map((tool) => tool.name).sort(),
		["subagent", "subagent_interrupt", "subagent_resume", "subagents_list"],
	);
	assert.deepEqual(
		registeredMessageRenderers.map((entry) => entry.name).sort(),
		["subagent_ping", "subagent_result", "subagent_status"],
	);
	const commandNames = registeredCommands.map((command) => command.name);
	assert.ok(commandNames.includes("iterate"));
	assert.ok(commandNames.includes("subagent"));
	assert.ok(commandNames.includes("workflow"));
	assert.equal(commandNames.includes("plan"), false);
});

test("/workflow requires a request and shows the tmux hint outside tmux", async () => {
	const { registeredCommands, sentUserMessages } = createMockExtensionApi();
	const command = registeredCommands.find((entry) => entry.name === "workflow");
	assert.ok(command);
	const notifications: Array<[string, string]> = [];
	const ctx = { ui: { notify: (text: string, level: string) => notifications.push([text, level]) } };

	await command.handler("   ", ctx);
	assert.deepEqual(notifications[0], ["Usage: /workflow <request>", "warning"]);

	const previous = process.env.TMUX;
	delete process.env.TMUX;
	try {
		await command.handler("test request", ctx);
	} finally {
		restoreEnvVar("TMUX", previous);
	}
	assert.match(notifications[1][0], /\/workflow needs tmux\. Start pi inside tmux/);
	assert.equal(sentUserMessages.length, 0);
});

test("buildWorkflowMessage wraps the bundled prompt like a skill expansion", () => {
	assert.ok(existsSync(testApi.WORKFLOW_SKILL_PATH));
	const message = testApi.buildWorkflowMessage("test request");
	assert.match(message, /^<skill name="workflow" location=".*workflow-skill\.md">\n/);
	assert.doesNotMatch(message, /^---/m);
	assert.match(message, /<\/skill>\n\ntest request$/);
	for (const phrase of [
		"subagent_resume",
		"`subagent`",
		"Gate 1",
		"Gate 2",
		"Gate 3",
		"git rev-parse HEAD",
		"git status --porcelain",
		"dirty",
		"Never commit",
		'agent: "planner"',
		'agent: "task-writer"',
		'agent: "implementer"',
		'agent: "reviewer"',
		" Planning",
		" Tasking",
		" Implementing",
		" Reviewing",
		" Workflow done",
		"ls -t .artifacts",
	]) {
		assert.ok(message.includes(phrase), `workflow prompt must mention ${phrase}`);
	}
});

test("PI_DENY_TOOLS gates tool registration", () => {
	const { registeredTools } = createMockExtensionApi({ env: { PI_DENY_TOOLS: "subagent, subagent_resume" } });
	assert.deepEqual(
		registeredTools.map((tool) => tool.name).sort(),
		["subagent_interrupt", "subagents_list"],
	);
});

test("createMockExtensionApi ignores ambient PI_* env and restores it afterwards", () => {
	const previous = process.env.PI_DENY_TOOLS;
	process.env.PI_DENY_TOOLS = "subagent,subagent_interrupt,subagents_list,subagent_resume";
	try {
		const { registeredTools } = createMockExtensionApi();
		assert.deepEqual(
			registeredTools.map((tool) => tool.name).sort(),
			["subagent", "subagent_interrupt", "subagent_resume", "subagents_list"],
		);
		// scrub window closed: ambient value visible again to execute()-time readers
		assert.equal(process.env.PI_DENY_TOOLS, "subagent,subagent_interrupt,subagents_list,subagent_resume");
	} finally {
		restoreEnvVar("PI_DENY_TOOLS", previous);
	}
});

test("/iterate emits a full-context fork tool call", () => {
	const { registeredCommands, sentUserMessages } = createMockExtensionApi();
	const iterate = registeredCommands.find((command) => command.name === "iterate");
	assert.ok(iterate);
	iterate.handler("Fix the bug", {});
	assert.equal(sentUserMessages.length, 1);
	assert.match(sentUserMessages[0], /fork: true/);
	assert.match(sentUserMessages[0], /name: "Iterate"/);
	assert.match(sentUserMessages[0], /"Fix the bug"/);
});

test("/subagent requires an agent name and emits a tool call for a known agent", async () => {
	await withIsolatedAgentEnv(async ({ projectAgentsDir }) => {
		writeAgentFile(projectAgentsDir, "scout-test", "name: scout-test\nauto-exit: true");
		const { registeredCommands, sentUserMessages } = createMockExtensionApi();
		const command = registeredCommands.find((entry) => entry.name === "subagent");
		assert.ok(command);
		const notifications: Array<[string, string]> = [];
		const ctx = { ui: { notify: (text: string, level: string) => notifications.push([text, level]) } };

		await command.handler("", ctx);
		assert.equal(notifications[0][0], "Usage: /subagent <agent> [task]");
		await command.handler("missing-agent do it", ctx);
		assert.match(notifications[1][0], /not found/);
		assert.equal(sentUserMessages.length, 0);

		await command.handler('scout-test list files', ctx);
		assert.equal(sentUserMessages.length, 1);
		assert.match(sentUserMessages[0], /agent: "scout-test", name: "Scout-test", task: "list files"/);
	});
});

test("resolveResumeLaunchBehavior defaults to auto-exit and non-interactive", () => {
	assert.deepEqual(testApi.resolveResumeLaunchBehavior({}), { autoExit: true, interactive: false });
	assert.deepEqual(testApi.resolveResumeLaunchBehavior({ autoExit: false }), { autoExit: false, interactive: true });
});

test("subagent renderCall handles partial args and subagent_resume exposes autoExit", () => {
	const { registeredTools } = createMockExtensionApi();
	const subagentTool = registeredTools.find((tool) => tool.name === "subagent");
	assert.ok(subagentTool);
	const output = subagentTool.renderCall({}, theme).render(80).join("\n");
	assert.match(output, /\(unnamed\)/);
	const previewed = subagentTool.renderCall({ name: "Echo", agent: "scout", task: "line one\nline two" }, theme).render(80).join("\n");
	assert.match(previewed, /Echo \(scout\)/);
	assert.match(previewed, /line one/);
	assert.match(previewed, /\(2 lines\)/);

	const resumeTool = registeredTools.find((tool) => tool.name === "subagent_resume");
	assert.ok(resumeTool);
	const autoExitSchema = resumeTool.parameters.properties.autoExit;
	assert.equal(autoExitSchema.type, "boolean");
	assert.match(autoExitSchema.description, /Defaults to true/);
});

test("parent tool rows use semantic states, sanitize display fields, and fit narrow widths", () => {
	const { registeredTools } = createMockExtensionApi();
	const marked = markerTheme("tools");
	const byName = (name: string) => {
		const tool = registeredTools.find((entry) => entry.name === name);
		assert.ok(tool, name);
		return tool;
	};
	const render = (component: AnyRecord, width = 80) => component.render(width).join("\n");
	const assertFits = (component: AnyRecord) => {
		for (const width of [16, 24, 40, 80]) {
			for (const line of component.render(width)) {
				assert.ok(visibleWidth(line) <= width, `${width}: ${JSON.stringify(line)}`);
			}
		}
	};

	const subagent = byName("subagent");
	const pending = subagent.renderCall(
		{
			name: "\x1b[31mWorker\x1b[0m\u009b",
			agent: "\x1b]8;;https://evil.example\x07scout\x1b]8;;\x07\u009d",
			cwd: "\x1b[2A/tmp/project\u0090",
			task: `A long Unicode 👩🏽‍💻 task ${"漢".repeat(120)}\u0085\nsecond line\u009c`,
		},
		marked,
	);
	const pendingOutput = render(pending);
	assert.match(pendingOutput, /tools:fg:accent/);
	assert.match(stripTerminalSequences(pendingOutput), /Worker \(scout\).*○ pending/);
	assert.match(pendingOutput, /tools:fg:toolOutput/);
	assert.doesNotMatch(pendingOutput, /\x1b\[31m|https:\/\/evil\.example|\x1b\[2A/);
	assert.doesNotMatch(pendingOutput, /[\u0080-\u009f]/u);
	assertFits(pending);

	const started = subagent.renderResult(
		{ content: [], details: { name: "Worker", status: "started" } },
		{},
		marked,
	);
	assert.match(render(started), /tools:fg:accent/);
	assert.match(stripTerminalSequences(render(started)), /Worker.*○ started/);

	const failed = subagent.renderResult(
		{
			content: [{ type: "text", text: "\x1b[31mError:\x1b[0m failed" }],
			details: { error: "failed" },
		},
		{},
		marked,
	);
	assert.match(render(failed), /tools:fg:error/);
	assert.match(stripTerminalSequences(render(failed)), /✗ failed.*Error: failed/);
	assertFits(failed);

	const interrupt = byName("subagent_interrupt");
	for (const component of [
		interrupt.renderCall({ name: "\x1b[31mWorker\x1b[0m" }, marked),
		interrupt.renderResult(
			{ content: [], details: { name: "Worker", status: "interrupt_requested" } },
			{},
			marked,
		),
	]) {
		const output = render(component);
		assert.match(output, /tools:fg:warning/);
		assert.match(stripTerminalSequences(output), /\? interrupt/);
		assertFits(component);
	}

	const resume = byName("subagent_resume");
	const resuming = resume.renderCall(
		{ name: "\x1b]8;;https://evil\x07Resume\x1b]8;;\x07", sessionPath: "/tmp/session.jsonl" },
		marked,
	);
	assert.match(stripTerminalSequences(render(resuming)), /Resume.*○ resuming session/);
	assert.doesNotMatch(render(resuming), /https:\/\/evil/);
	const resumed = resume.renderResult(
		{ content: [], details: { name: "Resume", status: "started" } },
		{},
		marked,
	);
	assert.match(stripTerminalSequences(render(resumed)), /Resume.*○ resumed/);

	const list = byName("subagents_list").renderResult(
		{
			content: [],
			details: {
				agents: [
					{
						name: "\x1b[31mScout\x1b[0m",
						source: "project",
						model: "model/漢字",
						description: "\x1b]8;;https://evil\x07find things\x1b]8;;\x07",
					},
				],
			},
		},
		{},
		marked,
	);
	assert.match(render(list), /tools:fg:success/);
	assert.match(stripTerminalSequences(render(list)), /✓.*Scout.*project.*model\/漢字.*find things/);
	assert.doesNotMatch(render(list), /\x1b\[31m|https:\/\/evil/);
	assertFits(list);
});

test("subagent tool returns the tmux hint outside tmux without spawning", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	try {
		const { registeredTools } = createMockExtensionApi();
		const subagentTool = registeredTools.find((tool) => tool.name === "subagent");
		assert.ok(subagentTool);
		const result = await subagentTool.execute("call-1", { name: "Echo", task: "ping" }, new AbortController().signal, () => {}, {
			sessionManager: { getSessionFile: () => "/tmp/parent.jsonl", getSessionId: () => "sid", getSessionDir: () => "/tmp" },
			cwd: "/tmp",
		});
		assert.match(result.content[0].text, /Subagents require tmux/);
		assert.match(result.content[0].text, /tmux new -A -s pi/);
		assert.equal(result.details.error, "tmux not available");
		assert.equal(testApi.runningSubagents.size, 0);
	} finally {
		restoreEnvVar("TMUX", previous);
	}
});

test("subagent tool blocks self-spawn and requires a session file", async () => {
	const previousAgent = process.env.PI_SUBAGENT_AGENT;
	process.env.PI_SUBAGENT_AGENT = "implementer";
	try {
		const { registeredTools } = createMockExtensionApi();
		const subagentTool = registeredTools.find((tool) => tool.name === "subagent");
		assert.ok(subagentTool);
		const blocked = await subagentTool.execute("c", { name: "X", task: "t", agent: "implementer" }, undefined, undefined, {});
		assert.equal(blocked.details.error, "self-spawn blocked");
	} finally {
		restoreEnvVar("PI_SUBAGENT_AGENT", previousAgent);
	}

	const previousTmux = process.env.TMUX;
	process.env.TMUX = process.env.TMUX ?? "/tmp/tmux-test,1,0";
	try {
		const { registeredTools } = createMockExtensionApi();
		const subagentTool = registeredTools.find((tool) => tool.name === "subagent");
		assert.ok(subagentTool);
		const noSession = await subagentTool.execute("c", { name: "X", task: "t" }, undefined, undefined, {
			sessionManager: { getSessionFile: () => undefined, getSessionId: () => "sid", getSessionDir: () => "/tmp" },
			cwd: "/tmp",
		});
		// Outside a real tmux client the tmux binary check may fail first; both outcomes spawn nothing.
		assert.ok(["no session file", "tmux not available"].includes(noSession.details.error));
	} finally {
		restoreEnvVar("TMUX", previousTmux);
	}
});

// ── interruption ──

test("resolveInterruptTarget resolves by id, exact name, and reports ambiguity", () => {
	const runningMap = testApi.runningSubagents;
	runningMap.clear();
	try {
		runningMap.set("a1", makeRunning({ id: "a1", name: "Worker" }) as any);
		runningMap.set("b2", makeRunning({ id: "b2", name: "Worker" }) as any);
		runningMap.set("c3", makeRunning({ id: "c3", name: "Scout" }) as any);

		const byId = testApi.resolveInterruptTarget({ id: "c3", name: "Worker" });
		assert.ok("running" in byId && byId.running.id === "c3");
		const byName = testApi.resolveInterruptTarget({ name: "Scout" });
		assert.ok("running" in byName && byName.running.id === "c3");
		const ambiguous = testApi.resolveInterruptTarget({ name: "Worker" });
		assert.ok("error" in ambiguous);
		assert.match(ambiguous.error, /Ambiguous subagent name/);
		const nameInIdField = testApi.resolveInterruptTarget({ id: "Scout" });
		assert.ok("running" in nameInIdField && nameInIdField.running.id === "c3");
		const ambiguousInIdField = testApi.resolveInterruptTarget({ id: "Worker" });
		assert.ok("error" in ambiguousInIdField);
		assert.match(ambiguousInIdField.error, /Ambiguous subagent name/);
		const unknownId = testApi.resolveInterruptTarget({ id: "zz" });
		assert.ok("error" in unknownId);
		assert.match(unknownId.error, /No running subagent with id "zz"/);
		const missing = testApi.resolveInterruptTarget({ name: "Nobody" });
		assert.ok("error" in missing);
		assert.match(missing.error, /No running subagent named/);
		const none = testApi.resolveInterruptTarget({});
		assert.ok("error" in none);
	} finally {
		runningMap.clear();
	}
});

test("requestSubagentInterrupt reports Escape failures and sends to the surface", () => {
	const running = makeRunning() as any;
	const failed = testApi.requestSubagentInterrupt(running, () => {
		throw new Error("tmux write failed");
	});
	assert.ok("error" in failed);
	assert.match(failed.error, /Failed to send Escape .* via tmux/);

	let sent = "";
	const ok = testApi.requestSubagentInterrupt(running, (surface: string) => {
		sent = surface;
	});
	assert.deepEqual(ok, { ok: true });
	assert.equal(sent, "%1");
});

test("handleSubagentInterrupt forces waiting on success and leaves status on failure", () => {
	const runningMap = testApi.runningSubagents;
	runningMap.clear();
	try {
		const activeState = observeStatus(createStatusState({ source: "pi", startTimeMs: 0 }), activeAt5, 5_000);
		runningMap.set("a1", makeRunning({ statusState: activeState }) as any);

		const failed = withMockedNow(20_000, () =>
			testApi.handleSubagentInterrupt({ name: "Worker" }, () => {
				throw new Error("tmux write failed");
			}),
		);
		assert.match(failed.content[0].text, /Failed to send Escape/);
		assert.equal(classifyStatus(runningMap.get("a1")!.statusState, 20_000).kind, "active");

		let sent = "";
		const result = withMockedNow(20_000, () =>
			testApi.handleSubagentInterrupt({ name: "Worker" }, (surface: string) => {
				sent = surface;
			}),
		);
		assert.equal(sent, "%1");
		assert.equal(result.content[0].text, 'Interrupt requested for subagent "Worker".');
		assert.deepEqual(result.details, { id: "a1", name: "Worker", status: "interrupt_requested" });
		const snapshot = classifyStatus(runningMap.get("a1")!.statusState, 20_000);
		assert.equal(snapshot.kind, "waiting");
		assert.equal(snapshot.activityLabel, "interrupted");
		assert.equal(runningMap.has("a1"), true);
	} finally {
		runningMap.clear();
	}
});

test("handleSubagentInterrupt refreshes the activity snapshot before forcing waiting", () => {
	const runningMap = testApi.runningSubagents;
	runningMap.clear();
	withTempDir((dir) => {
		mkdirSync(join(dir, "subagent-activity"), { recursive: true });
		const activityFile = getSubagentActivityFile(dir, "a1");
		writeFileSync(
			activityFile,
			`${JSON.stringify({
				version: 1,
				runningChildId: "a1",
				createdAt: 1_000,
				updatedAt: 19_000,
				sequence: 7,
				latestEvent: "tool_execution_start",
				phase: "active",
				agentActive: true,
				turnActive: true,
				providerActive: false,
				toolActive: true,
				activeScope: "tool",
				activeSince: 19_000,
				toolName: "bash",
			})}\n`,
		);
		try {
			runningMap.set("a1", makeRunning({ activityFile }) as any);
			withMockedNow(20_000, () => testApi.handleSubagentInterrupt({ name: "Worker" }, () => {}));
			const state = runningMap.get("a1")!.statusState;
			assert.equal(classifyStatus(state, 20_000).kind, "waiting");
			assert.equal(state.lastActivitySequence, 7);
			assert.equal(state.localOverrideSequence, 7);
		} finally {
			runningMap.clear();
		}
	});
});

test("handleSubagentInterrupt rejects Claude-backed subagents before delivery", () => {
	const runningMap = testApi.runningSubagents;
	runningMap.clear();
	try {
		runningMap.set("a1", makeRunning({ cli: "claude" }) as any);
		let delivered = false;
		const result = testApi.handleSubagentInterrupt({ name: "Worker" }, () => {
			delivered = true;
		});
		assert.equal(delivered, false);
		assert.match(result.content[0].text, /supported only for Pi-backed subagents/i);
		assert.deepEqual(result.details, { error: "claude interrupt unsupported", id: "a1", name: "Worker" });
	} finally {
		runningMap.clear();
	}
});

// ── result presentation ──

test("resolveResultPresentation formats success, failure, and provider errors", () => {
	const ok = testApi.resolveResultPresentation(
		{ exitCode: 0, elapsed: 61, summary: "All done.", sessionFile: "/tmp/s.jsonl" },
		"Worker",
	);
	assert.match(ok, /^Sub-agent "Worker" completed \(1m 1s\)\.\n\nAll done\./);
	assert.match(ok, /Resume: pi --session \/tmp\/s\.jsonl/);

	const failed = testApi.resolveResultPresentation(
		{ exitCode: 130, elapsed: 61, summary: "Sub-agent exited with code 130", sessionFile: "/tmp/s.jsonl" },
		"Worker",
	);
	assert.match(failed, /failed \(exit code 130\)/);
	assert.doesNotMatch(failed, /interrupted/);

	const errored = testApi.resolveResultPresentation(
		{ exitCode: 1, elapsed: 14, summary: "ignored", sessionFile: "/tmp/s.jsonl", errorMessage: "Anthropic 529 Overloaded after 3 retries" },
		"Worker",
	);
	assert.match(errored, /Sub-agent "Worker" failed after 14s/);
	assert.match(errored, /provider\/agent error — auto-retry exhausted/);
	assert.match(errored, /Error: Anthropic 529 Overloaded after 3 retries/);
	assert.match(errored, /subagent_resume/);
	assert.doesNotMatch(errored, /ignored/);
});

// ── renderers ──

test("status refresh payload keeps aggregate prose aligned with capped structured items", () => {
	const base = createStatusState({ source: "pi", startTimeMs: 0 });
	const activeState = observeStatus(base, {
		snapshot: "present",
		updatedAt: 419_000,
		sequence: 1,
		phase: "active",
		active: true,
		activeScope: "tool",
		activeSince: 419_000,
		activityLabel: "bash",
	}, 419_000);
	const waitingState = observeStatus(base, {
		snapshot: "present",
		updatedAt: 300_000,
		sequence: 2,
		phase: "waiting",
		waitingSince: 180_000,
	}, 300_000);
	const stalledState = observeStatus(base, { snapshot: "missing" }, 1_000);
	const transitions = [
		{ name: "Worker", snapshot: classifyStatus(activeState, 420_000), transition: "recovered" as const },
		{ name: "Scout", snapshot: classifyStatus(waitingState, 300_000), transition: "recovered" as const },
		{ name: "Reviewer", snapshot: classifyStatus(stalledState, 90_000), transition: "stalled" as const },
	];
	const payload = testApi.buildStatusRefreshMessage(transitions, 2);
	const lines = transitions.map(({ name, snapshot, transition }) =>
		formatTransitionLine(name, snapshot, transition)
	);

	assert.equal(payload.content, formatStatusAggregate(lines, 2));
	assert.deepEqual(payload.details.lines, lines.slice(0, 2));
	assert.equal(payload.details.overflow, 1);
	assert.equal(payload.details.items.length, 2);
	assert.deepEqual(
		payload.details.items.map((item: AnyRecord) => ({
			name: item.name,
			kind: item.kind,
			transition: item.transition,
			elapsedText: item.elapsedText,
		})),
		[
			{ name: "Worker", kind: "active", transition: "recovered", elapsedText: "7m" },
			{ name: "Scout", kind: "waiting", transition: "recovered", elapsedText: "5m" },
		],
	);
});

test("subagent_status renderer uses structured semantic states and respects narrow widths", () => {
	const { registeredMessageRenderers } = createMockExtensionApi();
	const entry = registeredMessageRenderers.find((renderer) => renderer.name === "subagent_status");
	assert.ok(entry);
	const visibleLines = [
		"\x1b[31mThis prose says waiting but must not drive state.\x1b[0m",
		"Scout running 3m, waiting 1m.",
		"Reviewer running 4m, stalled 1m.",
	];
	const items = [
		{
			name: "\x1b[31mWorker\x1b[0m\u009b",
			kind: "active",
			transition: "recovered",
			elapsedText: "5m\u0090",
			activityLabel: "\x1b]8;;https://evil\x07bash\x1b]8;;\x07\u009d",
			activeDurationText: "2m",
		},
		{
			name: "Scout",
			kind: "waiting",
			transition: "recovered",
			elapsedText: "3m",
			waitingDurationText: "1m",
		},
		{
			name: "Reviewer",
			kind: "stalled",
			transition: "stalled",
			elapsedText: "4m",
			snapshotProblemText: "1m",
		},
	];
	const marked = markerTheme("status");
	const rendered = entry.renderer(
		{ customType: "subagent_status", content: "Subagent status:", details: { lines: visibleLines, items, overflow: 2 } },
		{ expanded: true, outputPad: 0 },
		marked,
	);
	const output = rendered.render(80).join("\n");
	assert.match(output, /Subagent status/);
	assert.match(output, /status:bg:customMessageBg/);
	assert.match(output, /status:fg:success/);
	assert.match(output, /status:fg:muted/);
	assert.match(output, /status:fg:error/);
	assert.match(stripTerminalSequences(output), /Worker.*● recovered.*bash.*2m/);
	assert.match(stripTerminalSequences(output), /Scout.*◐ recovered.*1m/);
	assert.match(stripTerminalSequences(output), /Reviewer.*! stalled.*1m/);
	assert.doesNotMatch(output, /\x1b\[31m|https:\/\/evil|This prose says waiting/);
	assert.doesNotMatch(output, /[\u0080-\u009f]/u);
	assert.match(output, /\+2 more running\./);

	for (const width of [4, 5, 6, 16, 24, 40, 80]) {
		for (const line of rendered.render(width)) {
			assert.ok(visibleWidth(line) <= width, `width ${width}: ${JSON.stringify(line)}`);
		}
	}
	assert.equal(entry.renderer({ customType: "subagent_status", content: "", details: { lines: [], overflow: 0 } }, {}, theme), undefined);
});

test("subagent_result renderer strips the session reference and marks failures", () => {
	const { registeredMessageRenderers } = createMockExtensionApi();
	const entry = registeredMessageRenderers.find((renderer) => renderer.name === "subagent_result");
	assert.ok(entry);
	const marked = markerTheme("result");
	const content = testApi.resolveResultPresentation(
		{ exitCode: 0, elapsed: 5, summary: "PONG\nsecond line", sessionFile: "/tmp/s.jsonl" },
		"Echo",
	);
	const rendered = entry.renderer(
		{ customType: "subagent_result", content, details: { name: "Echo", exitCode: 0, elapsed: 5, sessionFile: "/tmp/s.jsonl", agent: "scout" } },
		{ expanded: true, outputPad: 0 },
		marked,
	);
	const output = rendered.render(80).join("\n");
	assert.match(output, /result:bg:toolSuccessBg/);
	assert.match(output, /result:fg:success/);
	assert.match(stripTerminalSequences(output), /✓ Echo \(scout\) — completed \(5s\)/);
	assert.match(stripTerminalSequences(output), /PONG\s*\nsecond line/);
	assert.match(stripTerminalSequences(output), /Resume: {2}pi --session \/tmp\/s\.jsonl/);
	assert.doesNotMatch(stripTerminalSequences(output), /Sub-agent "Echo" completed/);

	const failedRendered = entry.renderer(
		{
			customType: "subagent_result",
			content: "\x1b[31mboom\x1b[0m\n\x1b]8;;https://evil\x07details\x1b]8;;\x07",
			details: {
				name: "\x1b[31mEcho\x1b[0m\u009b",
				agent: "\x1b[2Ascout\u009d",
				exitCode: 1,
				elapsed: 5,
				errorMessage: "boom",
				sessionFile: "\x1b]8;;https://evil\x07/tmp/f.jsonl\x1b]8;;\x07\u0090",
			},
		},
		{ expanded: true, outputPad: 1 },
		marked,
	);
	const failedOutput = failedRendered.render(80).join("\n");
	assert.match(failedOutput, /result:bg:toolErrorBg/);
	assert.match(failedOutput, /result:fg:error/);
	assert.match(stripTerminalSequences(failedOutput), /✗ Echo \(scout\) — failed \(provider\/agent error\)/);
	assert.doesNotMatch(failedOutput, /\x1b\[31m|\x1b\[2A|https:\/\/evil/);
	assert.doesNotMatch(failedOutput, /[\u0080-\u009f]/u);

	for (const component of [rendered, failedRendered]) {
		for (const width of [4, 5, 6, 16, 24, 40, 80]) {
			for (const line of component.render(width)) {
				assert.ok(visibleWidth(line) <= width, `${width}: ${JSON.stringify(line)}`);
			}
		}
	}

	const collapsed = entry.renderer(
		{ customType: "subagent_result", content, details: { name: "Echo", exitCode: 0, elapsed: 5, sessionFile: "/tmp/s.jsonl" } },
		{ expanded: false, outputPad: 0 },
		marked,
	);
	const collapsedOutput = stripTerminalSequences(collapsed.render(80).join("\n"));
	assert.match(collapsedOutput, /PONG/);
	assert.match(collapsedOutput, /second line/);
	assert.match(collapsedOutput, /to expand/);
	assert.doesNotMatch(collapsedOutput, /Session:|pi --session/);
});

test("subagent_ping renderer shows the help request", () => {
	const { registeredMessageRenderers } = createMockExtensionApi();
	const entry = registeredMessageRenderers.find((renderer) => renderer.name === "subagent_ping");
	assert.ok(entry);
	const marked = markerTheme("ping");
	const rendered = entry.renderer(
		{
			customType: "subagent_ping",
			content: "",
			details: {
				name: "\x1b[31mWorker\x1b[0m\u009b",
				agent: "\x1b[2Ascout\u009d",
				message: "Need the API key\u0085\n\x1b]8;;https://evil\x07Please help\x1b]8;;\x07\u0090",
				sessionFile: "\x1b[31m/tmp/w.jsonl\x1b[0m\u009c",
			},
		},
		{ expanded: true, outputPad: 0 },
		marked,
	);
	const output = rendered.render(80).join("\n");
	assert.match(output, /ping:bg:customMessageBg/);
	assert.doesNotMatch(output, /ping:bg:toolSuccessBg/);
	assert.match(output, /ping:fg:warning/);
	assert.match(stripTerminalSequences(output), /\? Worker \(scout\) — needs help/);
	assert.match(stripTerminalSequences(output), /Need the API key\s*\nPlease help/);
	assert.match(stripTerminalSequences(output), /Session: \/tmp\/w\.jsonl/);
	assert.doesNotMatch(output, /\x1b\[31m|\x1b\[2A|https:\/\/evil/);
	assert.doesNotMatch(output, /[\u0080-\u009f]/u);
	for (const width of [4, 5, 6, 16, 24, 40, 80]) {
		for (const line of rendered.render(width)) {
			assert.ok(visibleWidth(line) <= width, `${width}: ${JSON.stringify(line)}`);
		}
	}

	const collapsed = entry.renderer(
		{
			customType: "subagent_ping",
			content: "",
			details: {
				name: "Worker",
				message: "Need the API key\nPlease help",
				sessionFile: "/tmp/w.jsonl",
			},
		},
		{ expanded: false, outputPad: 0 },
		marked,
	);
	const collapsedOutput = stripTerminalSequences(collapsed.render(80).join("\n"));
	assert.match(collapsedOutput, /Need the API key/);
	assert.match(collapsedOutput, /to expand/);
	assert.doesNotMatch(collapsedOutput, /Please help|Session:/);
});

// ── widget and misc ──

test("getShellReadyDelayMs defaults to 500 and honors the env override", () => {
	const original = process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS;
	try {
		delete process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS;
		assert.equal(testApi.getShellReadyDelayMs(), 500);
		process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS = "2500";
		assert.equal(testApi.getShellReadyDelayMs(), 2500);
		process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS = "nope";
		assert.equal(testApi.getShellReadyDelayMs(), 500);
	} finally {
		restoreEnvVar("PI_SUBAGENT_SHELL_READY_DELAY_MS", original);
	}
});

test("formatWidgetRightLabel covers every status kind", () => {
	const base = createStatusState({ source: "pi", startTimeMs: 0 });
	assert.deepEqual(testApi.formatWidgetRightLabel(classifyStatus(base, 1_000)), {
		state: "starting",
	});
	const active = observeStatus(base, activeAt5, 5_000);
	assert.deepEqual(testApi.formatWidgetRightLabel(classifyStatus(active, 6_000)), {
		state: "active",
		detail: "bash",
		duration: "1s",
	});
	const waiting = observeStatus(base, { snapshot: "present", updatedAt: 5_000, sequence: 1, phase: "waiting", waitingSince: 5_000 }, 5_000);
	assert.deepEqual(testApi.formatWidgetRightLabel(classifyStatus(waiting, 6_000)), {
		state: "waiting",
		duration: "1s",
	});
	const stalled = observeStatus(base, { snapshot: "missing" }, 1_000);
	assert.deepEqual(testApi.formatWidgetRightLabel(classifyStatus(stalled, 90_000)), {
		state: "stalled",
		duration: "1m",
	});
	const claude = createStatusState({ source: "claude", startTimeMs: 0 });
	assert.deepEqual(testApi.formatWidgetRightLabel(classifyStatus(claude, 125_000)), {
		state: "running",
		duration: "2m",
	});
});

test("applyWidgetMargin aligns the panel with the editor frame margin", () => {
	const box = ["\u256d─ Subagents ─ 1 running ─\u256e", "\u2570────\u256f"];
	const margined = testApi.applyWidgetMargin(box, 22);
	assert.equal(margined.length, 2);
	for (const line of margined) {
		assert.equal(visibleWidth(line), 22, JSON.stringify(line));
		assert.ok(line.startsWith(" "), `missing left margin: ${JSON.stringify(line)}`);
		assert.ok(line.endsWith(" "), `missing right margin: ${JSON.stringify(line)}`);
	}
	// Degenerate widths stay within bounds.
	assert.deepEqual(testApi.applyWidgetMargin(["x"], 0), [""]);
	assert.deepEqual(testApi.applyWidgetMargin(["x"], 1), [" "]);
	assert.deepEqual(testApi.applyWidgetMargin(["", "x"], 2), ["", "  "]);
	// Box rendered at width-2 plus margin lands on the exact widget width.
	const lines = testApi.renderSubagentWidgetLines(
		theme as any,
		[{ id: "a", name: "A", task: "", surface: "%0", startTime: 0, sessionFile: "s", interactive: false, statusState: createStatusState({ source: "pi", startTimeMs: 0 }) }] as any,
		20,
	);
	for (const line of testApi.applyWidgetMargin(lines, 22)) {
		assert.equal(visibleWidth(line), 22);
	}
});

test("renderSubagentWidgetLines uses settled semantic states and respects widths", () => {
	withMockedNow(1_000_000, () => {
		const base = createStatusState({ source: "pi", startTimeMs: 0 });
		const agents = [
			makeRunning({ id: "starting", name: "Starting", startTime: 999_000, statusState: createStatusState({ source: "pi", startTimeMs: 999_000 }) }),
			makeRunning({ id: "running", name: "Running", cli: "claude", startTime: 0, statusState: createStatusState({ source: "claude", startTimeMs: 0 }) }),
			makeRunning({ id: "active", name: "Active", startTime: 0, statusState: observeStatus(base, activeAt5, 5_000) }),
			makeRunning({ id: "waiting", name: "Waiting", startTime: 0, statusState: observeStatus(base, { snapshot: "present", updatedAt: 5_000, sequence: 1, phase: "waiting", waitingSince: 5_000 }, 5_000) }),
			makeRunning({ id: "stalled", name: "Stalled", startTime: 0, statusState: observeStatus(base, { snapshot: "missing" }, 1_000) }),
		];
		const marked = markerTheme("widget");
		const lines = testApi.renderSubagentWidgetLines(marked as any, agents as any, 80);
		assert.deepEqual(lines.map((line: string) => visibleWidth(line)), [80, 80, 80, 80, 80, 80, 80]);
		assert.match(lines[0], /Subagents/);
		for (const [name, token] of [
			["starting", "accent"],
			["running", "accent"],
			["active", "success"],
			["waiting", "muted"],
			["stalled", "error"],
		] as const) {
			const line = lines.find((candidate: string) => stripTerminalSequences(candidate).includes(name[0]!.toUpperCase() + name.slice(1)));
			assert.ok(line, name);
			assert.match(line, new RegExp(`widget:fg:${token}`));
		}
		const waitingLine = lines.find((line: string) => stripTerminalSequences(line).includes("Waiting"));
		assert.ok(waitingLine);
		assert.doesNotMatch(waitingLine, /widget:fg:(warning|error)/);

		for (const width of [0, 1, 2, 16, 24, 40, 80]) {
			for (const line of testApi.renderSubagentWidgetLines(marked as any, agents.slice(0, 1) as any, width)) {
				assert.ok(visibleWidth(line) <= width, `width ${width}: ${JSON.stringify(line)}`);
			}
		}
	});
});

test("widget row compaction drops metadata, detail, identity, then label in order", () => {
	withMockedNow(1_000_000, () => {
		const marked = markerTheme("compact");
		const status = {
			kind: "active",
			elapsedMs: 13_000,
			elapsedText: "13s",
			activeSinceMs: 999_000,
			activeDurationText: "1s",
			activeScope: "tool",
			waitingSinceMs: null,
			waitingDurationText: null,
			latestEvent: null,
			activityLabel: "bash",
			snapshotState: "present",
			snapshotError: null,
			snapshotProblemText: null,
			statusLabel: null,
		} as const;
		const agent = makeRunning({ name: "Scout", agent: "scout", startTime: 987_000 });
		const render = (width: number) =>
			stripTerminalSequences(testApi.renderWidgetAgentContent(marked as any, agent as any, status, width));

		assert.match(render(80), /00:13.*Scout \(scout\).*● active.*bash.*1s/);
		assert.match(render(24), /^Scout.*● active.*bash$/);
		assert.doesNotMatch(render(24), /00:13|scout|1s/);
		assert.match(render(16), /^Scout.*● active$/);
		assert.doesNotMatch(render(16), /bash/);
		assert.equal(render(8), "● active");
		assert.equal(render(1), "●");
	});
});

test("widget rendering uses the current theme and sanitizes display fields", () => {
	const agent = makeRunning({
		name: "\x1b[31mWorker\x1b[0m\x1b]8;;https://evil\x07link\x1b]8;;\x07",
		agent: "\x1b[2Ascout",
	});
	const first = testApi.renderSubagentWidgetLines(markerTheme("first") as any, [agent] as any, 80).join("\n");
	const second = testApi.renderSubagentWidgetLines(markerTheme("second") as any, [agent] as any, 80).join("\n");
	assert.match(first, /first:fg:accent/);
	assert.doesNotMatch(first, /second:|https:\/\/evil|\x1b\[31m|\x1b\[2A/);
	assert.match(second, /second:fg:accent/);
	assert.doesNotMatch(second, /first:/);
});

test("stripFrontmatter removes a leading frontmatter block", () => {
	assert.equal(testApi.stripFrontmatter("---\nname: x\n---\n\nBody\n"), "Body");
	assert.equal(testApi.stripFrontmatter("Body only"), "Body only");
});
