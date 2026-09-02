import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { getSubagentActivityFile } from "./activity.ts";
import { readAgentModelConfig, writeAgentModelConfig } from "./agent-models.ts";
import {
	fingerprintStrings,
	hashText,
	readLaunchProfile,
	validateLaunchProfile,
	writeLaunchProfile,
} from "./launch-profile.ts";
import piTmuxSubagents, { __test__ as testApi } from "./index.ts";
import { closeSurface } from "./tmux.ts";
import {
	classifyStatus,
	createStatusState,
	formatStatusAggregate,
	formatTransitionLine,
	observeStatus,
} from "./status.ts";
import {
	buildResumePiArgs as sharedBuildResumePiArgs,
	buildSubagentToolAllowlist as sharedBuildSubagentToolAllowlist,
	formatElapsed as sharedFormatElapsed,
	resolveResultPresentation as sharedResolveResultPresentation,
	resolveResumeLaunchBehavior as sharedResolveResumeLaunchBehavior,
} from "./subagent-services.ts";
import { loadWorkflowDefinitionFromPackage } from "./workflow/schema.ts";
import {
	createWorkflowRunState,
	getActiveWorkflowRun,
	recordWorkflowRunRoleSession,
	startWorkflowRun,
} from "./workflow/state.ts";

// Hermetic guard: when this suite runs inside a pi-spawned agent session the
// test process inherits PI_SUBAGENT_ID/PI_SUBAGENT_SESSION, isTaskRpcChildSession()
// sees them, and attachTaskRpc abstains — so the root-session wiring tests below
// would spuriously fail. Snapshot and strip just those two vars for the whole
// file (the only ones isTaskRpcChildSession reads), and restore them afterwards.
const savedSubagentEnv = {
	PI_SUBAGENT_ID: process.env.PI_SUBAGENT_ID,
	PI_SUBAGENT_SESSION: process.env.PI_SUBAGENT_SESSION,
};

before(() => {
	// Root-session wiring tests must not abstain because this process
	// happens to run inside a pi subagent that exported PI_SUBAGENT_*.
	delete process.env.PI_SUBAGENT_ID;
	delete process.env.PI_SUBAGENT_SESSION;
});

after(() => {
	for (const [key, value] of Object.entries(savedSubagentEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

type AnyRecord = Record<string, any>;

function createMockExtensionApi(options: { env?: Record<string, string> } = {}) {
	const registeredTools: AnyRecord[] = [];
	const registeredCommands: AnyRecord[] = [];
	const registeredMessageRenderers: AnyRecord[] = [];
	const eventHandlers = new Map<string, Array<(event: AnyRecord, ctx: AnyRecord) => unknown>>();
	const sentUserMessages: string[] = [];
	const sentMessages: AnyRecord[] = [];
	const api = {
		on(event: string, handler: (event: AnyRecord, ctx: AnyRecord) => unknown) {
			const handlers = eventHandlers.get(event) ?? [];
			handlers.push(handler);
			eventHandlers.set(event, handlers);
		},
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
		getCommands() {
			return registeredCommands.map((command) => ({
				name: command.name,
				description: command.description,
				source: "extension",
				sourceInfo: {
					path: "/tmp/pi-tmux-subagents/index.ts",
					source: "test",
					scope: "temporary",
					origin: "top-level",
				},
			}));
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
	return {
		api,
		registeredTools,
		registeredCommands,
		registeredMessageRenderers,
		eventHandlers,
		sentUserMessages,
		sentMessages,
	};
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

function writeWorkflowFixture(workflowsDir: string): void {
	const packageDir = join(workflowsDir, "docs-review");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		join(packageDir, "workflow.json"),
		`${JSON.stringify(
			{
				version: 1,
				id: "docs-review",
				command: {
					name: "docs",
					description: "Run the documentation review workflow",
					argumentHint: "<request>",
				},
				skill: "SKILL.md",
				data: {},
				roles: [
					{
						id: "author",
						label: "Author",
						agent: "scribe",
						reads: [],
						writes: [],
						handoff: "Continue authoring.",
					},
				],
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		join(packageDir, "SKILL.md"),
		"---\nname: docs-private\ndescription: Private docs workflow.\n---\n\n# Docs\n",
	);
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

test("index test exports use the shared subagent helper implementations", () => {
	assert.equal(testApi.formatElapsed, sharedFormatElapsed);
	assert.equal(testApi.buildSubagentToolAllowlist, sharedBuildSubagentToolAllowlist);
	assert.equal(testApi.resolveResumeLaunchBehavior, sharedResolveResumeLaunchBehavior);
	assert.equal(testApi.buildResumePiArgs, sharedBuildResumePiArgs);
	assert.equal(testApi.resolveResultPresentation, sharedResolveResultPresentation);
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

// ── launch profiles (T1) ──

test("buildLaunchProfile captures the stable role contract and mutable launch state", async () => {
	await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
		const skillPath = join(globalAgentsDir, "..", "skills", "demo-skill", "SKILL.md");
		mkdirSync(dirname(skillPath), { recursive: true });
		writeFileSync(skillPath, "# Demo skill\n");

		const resources = {
			tools: fingerprintStrings(["read", "bash"]),
			visibleSkills: fingerprintStrings(["demo-skill"]),
			updatedAt: "2026-08-27T12:00:00.000Z",
		};
		const profile = testApi.buildLaunchProfile({
			displayName: "Worker",
			agentName: "worker",
			roleBody: "Do the slice.",
			systemPromptMode: "append",
			cwd: "/tmp/project",
			agentDir: "/tmp/agent",
			controls: {
				spawning: false,
				denyTools: ["subagent"],
				autoExit: true,
				interactive: false,
				sessionMode: "standalone",
			},
			effectiveSkills: "demo-skill,other",
			modelArgument: "anthropic/claude:high",
			originalSessionPath: "/tmp/sessions/child.jsonl",
			resources,
			workflow: {
				version: 1,
				workflowId: "demo-workflow",
				runId: "run-demo",
				roleId: "executor",
				manifestHash: hashText("demo manifest"),
				skillHash: hashText("demo skill"),
				policy: "per-role",
				assignmentSource: "configured",
				projectRoot: "/tmp/project",
				data: { plan: "/tmp/PLAN.md" },
			},
		});

		assert.equal(validateLaunchProfile(profile), true);
		assert.equal(profile.stable.roleBodyHash, hashText("Do the slice."));
		assert.equal(profile.stable.primarySkill?.name, "demo-skill");
		assert.equal(profile.stable.primarySkill?.hash, hashText("# Demo skill\n"));
		assert.deepEqual(profile.runtime.originalModel, {
			provider: "anthropic",
			model: "claude",
			thinking: "high",
		});
		assert.deepEqual(profile.runtime.lastModel, profile.runtime.originalModel);
		assert.deepEqual(profile.resources, resources);
		assert.equal(profile.workflow?.assignmentSource, "configured");

		assert.deepEqual(testApi.parseLegacyModelSelection("openrouter/vendor/model"), {
			provider: "openrouter",
			model: "vendor/model",
		});
		assert.equal(testApi.parseLegacyModelSelection("claude"), undefined);
	});
});

test("collectResourceFingerprints uses active tools and explicit skills deterministically", () => {
	// Freeze the clock: two captures must be byte-identical, which flakes
	// when their `updatedAt` timestamps straddle a millisecond boundary.
	const RealDate = Date;
	const frozenMs = RealDate.now();
	class FrozenDate extends RealDate {
		constructor(value?: number | string) {
			super(value ?? frozenMs);
		}
		static override now(): number {
			return frozenMs;
		}
	}
	globalThis.Date = FrozenDate as unknown as typeof Date;
	try {
		const pi = {
			getActiveTools: () => ["bash", "read", "bash"],
			getCommands: () => [{ name: "planner", source: "skill" }],
		} as any;
		const first = testApi.collectResourceFingerprints(pi, "implement, planner");
		const second = testApi.collectResourceFingerprints(pi, "implement, planner");
		assert.deepEqual(first, second);
		assert.deepEqual(first.tools, fingerprintStrings(["bash", "read"]));
		assert.deepEqual(first.visibleSkills, fingerprintStrings(["implement", "planner"]));
		assert.deepEqual(
			testApi.collectResourceFingerprints(pi, undefined).visibleSkills,
			fingerprintStrings(["planner"]),
		);
	} finally {
		globalThis.Date = RealDate;
	}
});

// ── bundled agents (T9) ──

test("bundled agents parse with the expected spawning, auto-exit, and interactive flags", () => {
	const dir = testApi.getBundledAgentsDir();
	const files = readdirSync(dir).filter((file) => file.endsWith(".md")).sort();
	assert.deepEqual(files, [
		"Explore.md",
		"Plan.md",
		"claude-code.md",
		"executor.md",
		"general-purpose.md",
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
	assert.ok(byName.get("executor")!.spawning === undefined || byName.get("executor")!.spawning === true);
	for (const name of ["planner", "task-writer", "reviewer", "worker", "scout", "claude-code"]) {
		assert.equal(byName.get(name)!.spawning, false, name);
	}
	assert.equal(byName.get("planner")!.autoExit, false);
	assert.equal(byName.get("planner")!.interactive, true);
	assert.equal(byName.get("planner")!.skills, "planner");
	assert.equal(byName.get("task-writer")!.skills, "plan-to-tasks");
	assert.equal(byName.get("executor")!.skills, "execute");
	assert.equal(byName.get("reviewer")!.skills, "execution-review");
	for (const name of ["task-writer", "executor", "reviewer", "worker", "scout"]) {
		assert.equal(byName.get(name)!.autoExit, true, name);
		assert.equal(byName.get(name)!.model, undefined, `${name} inherits the session model`);
		assert.equal(byName.get(name)!.systemPromptMode, "append", name);
	}
	assert.equal(byName.get("claude-code")!.cli, "claude");
	for (const name of ["planner", "worker", "scout", "reviewer", "task-writer", "executor"]) {
		assert.equal(testApi.resolveEffectiveInteractive({ name, task: "" }, byName.get(name)!), name === "planner", name);
	}
});

test("task writer and reviewer no longer declare maintained tool lists", () => {
	const dir = testApi.getBundledAgentsDir();
	// Workflow roles and the worker delegate keep full current tool discovery;
	// worker dropped its frontmatter list when it took on write work.
	for (const name of ["planner", "task-writer", "executor", "reviewer", "worker"]) {
		const content = readFileSync(join(dir, `${name}.md`), "utf8");
		assert.doesNotMatch(content, /^tools:/m, `${name} must not maintain a tools list`);
		const parsed = testApi.parseAgentDefinition(content, name);
		assert.ok(parsed, name);
		assert.equal(parsed.tools, undefined, `${name} keeps full current tool discovery`);
	}
	// The read-only scout delegate keeps its restricted tool list.
	const scout = testApi.parseAgentDefinition(readFileSync(join(dir, "scout.md"), "utf8"), "scout");
	assert.ok(scout, "scout");
	assert.ok(scout.tools, "scout keeps its tools list");
});

// ── registration and commands ──

test("registers the eight tools, three renderers, and the commands", () => {
	const { registeredTools, registeredCommands, registeredMessageRenderers } = createMockExtensionApi();
	assert.deepEqual(
		registeredTools.map((tool) => tool.name).sort(),
		[
			"subagent",
			"subagent_interrupt",
			"subagent_resume",
			"subagents_list",
			"workflow_complete",
			"workflow_recover",
			"workflow_resume",
			"workflow_spawn",
		],
	);
	assert.deepEqual(
		registeredMessageRenderers.map((entry) => entry.name).sort(),
		["subagent_ping", "subagent_result", "subagent_status"],
	);
	const subagent = registeredTools.find((tool) => tool.name === "subagent");
	const resume = registeredTools.find((tool) => tool.name === "subagent_resume");
	assert.equal(subagent?.parameters.properties.workflowRunId, undefined);
	assert.equal(subagent?.parameters.properties.workflowArtifacts, undefined);
	assert.equal(resume?.parameters.properties.workflowArtifacts, undefined);
	for (const name of ["workflow_spawn", "workflow_resume", "workflow_recover"]) {
		const tool = registeredTools.find((entry) => entry.name === name);
		assert.match(tool?.description ?? "", /do not poll/i);
	}
	const commandNames = registeredCommands.map((command) => command.name);
	assert.ok(commandNames.includes("iterate"));
	assert.ok(commandNames.includes("subagent"));
	assert.ok(commandNames.includes("workflow"));
	assert.ok(commandNames.includes("workflows"));
	assert.ok(commandNames.includes("workflow-resume"));
	assert.equal(commandNames.includes("pter"), false);
	assert.equal(commandNames.includes("plan"), false);
});

test("session_start discovers workflows and registers a generated alias once across reloads", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-workflow-command-integration-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousSubagentId = process.env.PI_SUBAGENT_ID;
	const agentDir = join(root, "agent");
	const projectDir = join(root, "project");
	mkdirSync(projectDir, { recursive: true });
	writeWorkflowFixture(join(agentDir, "workflows"));
	writeAgentFile(join(agentDir, "agents"), "scribe", "name: Scribe");
	process.env.PI_CODING_AGENT_DIR = agentDir;
	process.env.PI_SUBAGENT_ID = "command-test-child";
	try {
		const { registeredCommands, eventHandlers } = createMockExtensionApi();
		const notifications: Array<[string, string]> = [];
		const ctx = {
			...policyContext({ cwd: projectDir }),
			isIdle: () => true,
			isProjectTrusted: () => true,
			sessionManager: {
				getSessionFile: () => join(root, "parent.jsonl"),
				getBranch: () => [],
			},
			ui: {
				notify: (message: string, level: string) =>
					notifications.push([message, level]),
			},
		};
		const handlers = eventHandlers.get("session_start") ?? [];
		assert.equal(handlers.length, 1);
		await handlers[0]({ reason: "startup" }, ctx);
		await handlers[0]({ reason: "reload" }, ctx);

		assert.equal(
			registeredCommands.filter((command) => command.name === "docs").length,
			1,
		);
		const workflow = registeredCommands.find(
			(command) => command.name === "workflow",
		);
		assert.ok(workflow);
		assert.deepEqual(
			workflow
				.getArgumentCompletions("run doc")
				.map((item: AnyRecord) => item.value),
			["run docs-review "],
		);

		const workflows = registeredCommands.find(
			(command) => command.name === "workflows",
		);
		assert.ok(workflows);
		await workflows.handler("", ctx);
		assert.match(notifications.at(-1)?.[0] ?? "", /docs-review/);
		assert.match(notifications.at(-1)?.[0] ?? "", /alias \/docs/);
		assert.match(notifications.at(-1)?.[0] ?? "", /source global/);
	} finally {
		restoreEnvVar("PI_CODING_AGENT_DIR", previousAgentDir);
		restoreEnvVar("PI_SUBAGENT_ID", previousSubagentId);
		rmSync(root, { recursive: true, force: true });
	}
});

test("/workflow requires a lifecycle subcommand and /workflow-resume requires an active run", async () => {
	const { registeredCommands, sentUserMessages } = createMockExtensionApi();
	const command = registeredCommands.find((entry) => entry.name === "workflow");
	const resume = registeredCommands.find((entry) => entry.name === "workflow-resume");
	assert.ok(command);
	assert.ok(resume);
	const notifications: Array<[string, string]> = [];
	const ctx = {
		...policyContext(),
		isIdle: () => true,
		ui: { notify: (text: string, level: string) => notifications.push([text, level]) },
	};

	await command.handler("   ", ctx);
	assert.deepEqual(
		notifications[0],
		["Usage: /workflow list | run <id> <request> | status | abort", "warning"],
	);
	await resume.handler("", ctx);
	assert.deepEqual(notifications[1], ["No active workflow run to resume.", "warning"]);
	assert.equal(sentUserMessages.length, 0);
});

test("/workflow status is available before any generic run starts", async () => {
	const { registeredCommands, sentUserMessages } = createMockExtensionApi();
	const command = registeredCommands.find((entry) => entry.name === "workflow");
	assert.ok(command);
	const notifications: Array<[string, string]> = [];
	const ctx = {
		...policyContext(),
		ui: {
			notify: (text: string, level: string) => notifications.push([text, level]),
		},
	};
	await command.handler("status", ctx);
	assert.equal(sentUserMessages.length, 0);
	assert.equal(testApi.runningSubagents.size, 0);
	assert.match(notifications[0]?.[0] ?? "", /No active workflow run/);
});

test("workflow commits publish only after durable append and fail closed after a partial append", () => {
	const emptyState = {
		activeRunId: null,
		runsById: {},
		runOrder: [],
	} as any;
	const previousState = {
		activeRunId: "old",
		runsById: { old: { runId: "old" } },
		runOrder: ["old"],
	} as any;
	const nextState = {
		activeRunId: "next",
		runsById: { next: { runId: "next" } },
		runOrder: ["next"],
	} as any;
	const snapshots = [{ runId: "old" }, { runId: "next" }] as any;

	try {
		testApi.setWorkflowRunStateForTests(previousState);
		const observedDuringAppend: unknown[] = [];
		testApi.commitWorkflowRunTransition(
			{
				appendEntry() {
					observedDuringAppend.push(testApi.getWorkflowRunStateForTests());
				},
			} as any,
			{ state: nextState, snapshots } as any,
		);
		assert.deepEqual(observedDuringAppend, [previousState, previousState]);
		assert.equal(testApi.getWorkflowRunStateForTests(), nextState);

		testApi.setWorkflowRunStateForTests(previousState);
		assert.throws(
			() =>
				testApi.commitWorkflowRunTransition(
					{
						appendEntry() {
							throw new Error("disk full");
						},
					} as any,
					{ state: nextState, snapshots: [snapshots[0]] } as any,
				),
			/before any snapshot was appended; live workflow state was left unchanged/i,
		);
		assert.equal(testApi.getWorkflowRunStateForTests(), previousState);

		testApi.setWorkflowRunStateForTests(previousState);
		let appendCount = 0;
		assert.throws(
			() =>
				testApi.commitWorkflowRunTransition(
					{
						appendEntry() {
							appendCount += 1;
							if (appendCount === 2) throw new Error("disk full");
						},
					} as any,
					{ state: nextState, snapshots } as any,
				),
			/appending 1 of 2 snapshots; live workflow state was cleared/i,
		);
		assert.deepEqual(testApi.getWorkflowRunStateForTests(), emptyState);
	} finally {
		testApi.setWorkflowRunStateForTests(emptyState);
	}
});

test("session_start keeps the restored run in memory and warns when snapshot persistence fails", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-workflow-restore-persist-"));
	const projectDir = join(root, "project");
	mkdirSync(projectDir, { recursive: true });
	writeWorkflowFixture(join(root, "agent", "workflows"));
	const definitionResult = loadWorkflowDefinitionFromPackage(
		join(root, "agent", "workflows", "docs-review"),
	);
	assert.equal(definitionResult.status, "ok");
	// Fabricate the persisted branch entry through the real state machine so the
	// snapshot round-trips through restoreWorkflowRunStateFromSession.
	const started = startWorkflowRun(createWorkflowRunState(), {
		runId: "run-docs",
		source: "project",
		definition: definitionResult.definition,
		projectRoot: projectDir,
		policy: "per-role",
		assignmentSource: "preset",
		originalAssignments: {
			author: { provider: "test", model: "echo", thinking: "off" },
		},
	});
	const launched = recordWorkflowRunRoleSession(
		started.state,
		"run-docs",
		"author",
		join(root, "author-1.jsonl"),
		{ launchStatus: "running" },
	);
	const runningSnapshot = getActiveWorkflowRun(launched.state);
	assert.equal(runningSnapshot?.activeLaunch?.status, "running");

	const previousSubagentId = process.env.PI_SUBAGENT_ID;
	process.env.PI_SUBAGENT_ID = "restore-persist-test-child";
	const { api, eventHandlers } = createMockExtensionApi();
	const notifications: Array<[string, string]> = [];
	const appendedTypes: string[] = [];
	// The shared appendEntry mock throws only for workflow-run snapshot entries.
	(api as any).appendEntry = (customType: string) => {
		appendedTypes.push(customType);
		if (customType === "pi-tmux-subagents.workflow-run") {
			throw new Error("parent log busy");
		}
	};
	const ctx = {
		...policyContext({ cwd: projectDir }),
		isIdle: () => true,
		isProjectTrusted: () => true,
		sessionManager: {
			getSessionFile: () => join(root, "parent.jsonl"),
			getBranch: () => [
				{
					type: "custom",
					customType: "pi-tmux-subagents.workflow-run",
					data: runningSnapshot,
				},
			],
		},
		ui: {
			notify: (message: string, level: string) => notifications.push([message, level]),
		},
	};
	try {
		const handlers = eventHandlers.get("session_start") ?? [];
		assert.equal(handlers.length, 1);
		await handlers[0]({ reason: "reload" }, ctx);

		const state = testApi.getWorkflowRunStateForTests();
		assert.equal(state.activeRunId, "run-docs");
		const restored = state.runsById["run-docs"];
		assert.ok(restored);
		assert.equal(restored.status, "active");
		assert.equal(restored.activeLaunch?.status, "interrupted");
		assert.deepEqual(appendedTypes, ["pi-tmux-subagents.workflow-run"]);
		const persistWarning = notifications
			.map(([message]) => message)
			.find((message) => /restored in memory/i.test(message));
		assert.ok(persistWarning);
		assert.match(persistWarning, /session log failed: parent log busy/i);
		assert.match(persistWarning, /re-derived on the next reload/i);
	} finally {
		restoreEnvVar("PI_SUBAGENT_ID", previousSubagentId);
		delete (api as any).appendEntry;
		testApi.setWorkflowRunStateForTests(createWorkflowRunState());
		rmSync(root, { recursive: true, force: true });
	}
});

test("PI_DENY_TOOLS gates tool registration", () => {
	const { registeredTools } = createMockExtensionApi({
		env: {
			PI_DENY_TOOLS:
				"subagent,subagent_resume,workflow_spawn,workflow_resume,workflow_recover,workflow_complete",
		},
	});
	assert.deepEqual(
		registeredTools.map((tool) => tool.name).sort(),
		["subagent_interrupt", "subagents_list"],
	);
});

test("createMockExtensionApi ignores ambient PI_* env and restores it afterwards", () => {
	const previous = process.env.PI_DENY_TOOLS;
	process.env.PI_DENY_TOOLS = "subagent,subagent_interrupt,subagents_list,subagent_resume,workflow_recover";
	try {
		const { registeredTools } = createMockExtensionApi();
		assert.deepEqual(
			registeredTools.map((tool) => tool.name).sort(),
			[
				"subagent",
				"subagent_interrupt",
				"subagent_resume",
				"subagents_list",
				"workflow_complete",
				"workflow_recover",
				"workflow_resume",
				"workflow_spawn",
			],
		);
		// scrub window closed: ambient value visible again to execute()-time readers
		assert.equal(
			process.env.PI_DENY_TOOLS,
			"subagent,subagent_interrupt,subagents_list,subagent_resume,workflow_recover",
		);
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
	process.env.PI_SUBAGENT_AGENT = "executor";
	try {
		const { registeredTools } = createMockExtensionApi();
		const subagentTool = registeredTools.find((tool) => tool.name === "subagent");
		assert.ok(subagentTool);
		const blocked = await subagentTool.execute("c", { name: "X", task: "t", agent: "executor" }, undefined, undefined, {});
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

const POLICY_MODEL = {
	provider: "anthropic",
	id: "claude",
	name: "Claude",
	api: "anthropic-messages",
	baseUrl: "https://api.anthropic.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200_000,
	maxTokens: 16_000,
} as any;

function policyContext(overrides: AnyRecord = {}) {
	return {
		sessionManager: {
			getSessionFile: () => "/tmp/parent.jsonl",
			getSessionId: () => "sid",
			getSessionDir: () => "/tmp",
		},
		cwd: "/tmp",
		model: POLICY_MODEL,
		thinkingLevel: "high",
		scopedModels: [],
		modelRegistry: { getAvailable: () => [POLICY_MODEL] },
		hasUI: false,
		ui: { select: async () => undefined },
		...overrides,
	};
}

function writeResumeSidecar(dir: string, modelArgument = "anthropic/claude:high"): string {
	const sessionPath = join(dir, `resume-${Math.random().toString(16).slice(2)}.jsonl`);
	writeFileSync(sessionPath, "{}\n");
	writeLaunchProfile(
		sessionPath,
		testApi.buildLaunchProfile({
			displayName: "Worker",
			roleBody: "Do the work.",
			systemPromptMode: "append",
			cwd: dir,
			agentDir: dir,
			controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
			modelArgument,
			originalSessionPath: sessionPath,
			resources: {
				tools: fingerprintStrings([]),
				visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-08-27T12:00:00.000Z",
			},
		}),
	);
	return sessionPath;
}

test("subagent model policies reject invalid new-spawn selections before tmux work", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent");
		assert.ok(tool);
		const ctx = policyContext();

		const previousModel = await tool.execute(
			"c",
			{ name: "Echo", task: "t", model: "previous" },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(previousModel.details.error, "model selection failed");
		assert.match(previousModel.content[0].text, /valid only when resuming/);

		const pick = await tool.execute(
			"c",
			{ name: "Echo", task: "t", model: "pick" },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(pick.details.error, "model selection failed");
		assert.match(pick.content[0].text, /needs interactive UI/);

		const unsupported = await tool.execute(
			"c",
			{ name: "Echo", task: "t", model: "missing/model:high" },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(unsupported.details.error, "model selection failed");
		assert.match(unsupported.content[0].text, /not authenticated and available/);

		for (const model of ["parent", "anthropic/claude:high"]) {
			const accepted: AnyRecord = await tool.execute(
				"c",
				{ name: "Echo", task: "t", model },
				undefined,
				undefined,
				ctx,
			);
			assert.equal(accepted.details.error, "tmux not available");
		}

		const omitted = await tool.execute("c", { name: "Echo", task: "t" }, undefined, undefined, ctx);
		assert.equal(omitted.details.error, "tmux not available");
		assert.equal(testApi.runningSubagents.size, 0);
	} finally {
		restoreEnvVar("TMUX", previous);
	}
});

const OTHER_MODEL = {
	provider: "openai",
	id: "gpt",
	name: "GPT",
	api: "openai-responses",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100_000,
	maxTokens: 16_000,
} as any;

async function executeWithoutSubagentIdentity<T>(run: () => Promise<T>): Promise<T> {
	const saved = process.env.PI_SUBAGENT_AGENT;
	delete process.env.PI_SUBAGENT_AGENT;
	try {
		return await run();
	} finally {
		restoreEnvVar("PI_SUBAGENT_AGENT", saved);
	}
}

test("malformed or unresolvable agent model configs hard-error before tmux work", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	try {
		await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
			const agentDir = dirname(globalAgentsDir);
			const { registeredTools } = createMockExtensionApi();
			const tool = registeredTools.find((entry) => entry.name === "subagent");
			assert.ok(tool);

			writeFileSync(join(agentDir, "agent-models.json"), "{not json");
			const malformed: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute("c", { name: "W", task: "t", agent: "worker" }, undefined, undefined, policyContext()),
			);
			assert.equal(malformed.details.error, "agent model config invalid");
			assert.match(malformed.content[0].text, /Malformed agent model config/);
			assert.match(malformed.content[0].text, /agent-models\.json/);
			assert.match(malformed.content[0].text, /\/agent-models/);

			writeAgentModelConfig({ version: 1, agents: { worker: "missing/gone:high" } }, agentDir);
			const unavailable: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute("c", { name: "W", task: "t", agent: "worker" }, undefined, undefined, policyContext()),
			);
			assert.equal(unavailable.details.error, "agent model config resolution failed");
			const text = unavailable.content[0].text;
			assert.match(text, /Agent "worker"/);
			assert.match(text, /"missing\/gone:high"/);
			assert.match(text, /not authenticated and available/);
			assert.match(text, /agent-models\.json/);
			assert.match(text, /\/agent-models/);
			assert.equal(testApi.runningSubagents.size, 0);
		});
	} finally {
		restoreEnvVar("TMUX", previous);
	}
});

test("agent model config yields to params.model and never applies to agent-less or cli agents", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	try {
		await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
			const agentDir = dirname(globalAgentsDir);
			const { registeredTools } = createMockExtensionApi();
			const tool = registeredTools.find((entry) => entry.name === "subagent");
			assert.ok(tool);
			const ctx = policyContext({
				modelRegistry: { getAvailable: () => [POLICY_MODEL, OTHER_MODEL] },
			});

			writeAgentModelConfig({ version: 1, agents: { worker: "anthropic/claude:high" } }, agentDir);
			const explicit: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute(
					"c",
					{ name: "W", task: "t", agent: "worker", model: "missing/explicit" },
					undefined,
					undefined,
					ctx,
				),
			);
			assert.equal(explicit.details.error, "model selection failed");
			assert.match(explicit.content[0].text, /missing\/explicit/);

			writeAgentModelConfig({ version: 1, agents: { "claude-code": "missing/gone" } }, agentDir);
			const cliAgent: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute("c", { name: "C", task: "t", agent: "claude-code" }, undefined, undefined, ctx),
			);
			assert.equal(cliAgent.details.error, "tmux not available");

			const agentless: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute("c", { name: "Bare", task: "t" }, undefined, undefined, ctx),
			);
			assert.equal(agentless.details.error, "tmux not available");

			writeAgentModelConfig({ version: 1, agents: { worker: "openai/gpt:high" } }, agentDir);
			const configured: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute("c", { name: "W", task: "t", agent: "worker" }, undefined, undefined, ctx),
			);
			assert.equal(configured.details.error, "tmux not available");
		});
	} finally {
		restoreEnvVar("TMUX", previous);
	}
});

test("ordinary subagent launches keep agent model config precedence for workflow-named agents", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	try {
		await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
			const agentDir = dirname(globalAgentsDir);
			const { registeredTools } = createMockExtensionApi();
			const tool = registeredTools.find((entry) => entry.name === "subagent");
			assert.ok(tool);
			writeAgentModelConfig(
				{
					version: 1,
					agents: {
						planner: "missing/gone:high",
						"task-writer": "missing/gone:high",
						executor: "missing/gone:high",
						reviewer: "missing/gone:high",
					},
			},
				agentDir,
			);
			for (const agent of ["planner", "task-writer", "executor", "reviewer"]) {
				const result: AnyRecord = await executeWithoutSubagentIdentity(() =>
					tool.execute("c", { name: agent, task: "t", agent }, undefined, undefined, policyContext()),
				);
				assert.equal(result.details.error, "agent model config resolution failed", agent);
			}
		});
	} finally {
		restoreEnvVar("TMUX", previous);
	}
});

test("configured agent defaults reach the child --model and launch profile over frontmatter and parent", { timeout: 20_000 }, async () => {
	if (!process.env.TMUX) return;
	const root = mkdtempSync(join(tmpdir(), "pi-agent-models-launch-"));
	const agentDir = join(root, "agent");
	const projectDir = join(root, "project");
	mkdirSync(join(agentDir, "agents"), { recursive: true });
	mkdirSync(projectDir, { recursive: true });
	const launched: Array<{ id: string; pane: string }> = [];
	const previousCwd = process.cwd();
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	try {
		process.chdir(projectDir);
		process.env.PI_CODING_AGENT_DIR = agentDir;
		writeAgentFile(join(agentDir, "agents"), "plain-agent", "auto-exit: true\nspawning: false");
		writeAgentFile(
			join(agentDir, "agents"),
			"frontmatter-agent",
			"auto-exit: true\nspawning: false\nmodel: front/matter:high",
		);
		writeAgentFile(
			join(agentDir, "agents"),
			"hero",
			"name: different-name\nauto-exit: true\nspawning: false",
		);
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent");
		assert.ok(tool);
		const ctx = {
			...policyContext({
				cwd: projectDir,
				modelRegistry: { getAvailable: () => [POLICY_MODEL, OTHER_MODEL] },
			}),
			sessionManager: {
				getSessionFile: () => join(projectDir, "parent.jsonl"),
				getSessionId: () => "agent-models-parent",
				getSessionDir: () => projectDir,
			},
		};
		const spawn = async (params: AnyRecord): Promise<AnyRecord> => {
			const result: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute("c", { task: "Reply with the single word ready.", ...params }, undefined, undefined, ctx),
			);
			assert.equal(result.details.status, "started", JSON.stringify(result.details));
			launched.push({ id: result.details.id, pane: testApi.runningSubagents.get(result.details.id)!.surface });
			return result;
		};
		const modelFlag = (result: AnyRecord): string => {
			const script = readFileSync(result.details.launchScriptFile, "utf8");
			const match = script.match(/--model '([^']+)'/);
			assert.ok(match, script);
			return match[1];
		};

		writeAgentModelConfig(
			{
				version: 1,
				agents: {
					"plain-agent": "openai/gpt:high",
					"frontmatter-agent": "openai/gpt:high",
					hero: "openai/gpt:high",
				},
			},
			agentDir,
		);
		const overParent = await spawn({ name: "Plain", agent: "plain-agent" });
		assert.equal(modelFlag(overParent), "openai/gpt:high");
		const profileRead = readLaunchProfile(testApi.runningSubagents.get(overParent.details.id)!.sessionFile);
		assert.equal(profileRead.status, "ok");
		assert.deepEqual(profileRead.profile.runtime.originalModel, {
			provider: "openai",
			model: "gpt",
			thinking: "high",
		});

		// The filename identifier keys the config even when the frontmatter
		// `name:` differs, so a default set for `hero` reaches the child.
		const mismatchedName = await spawn({ name: "Hero", agent: "hero" });
		assert.equal(modelFlag(mismatchedName), "openai/gpt:high");

		const overFrontmatter = await spawn({ name: "Front", agent: "frontmatter-agent" });
		assert.equal(modelFlag(overFrontmatter), "openai/gpt:high");
		assert.doesNotMatch(readFileSync(overFrontmatter.details.launchScriptFile, "utf8"), /front\/matter/);

		const explicitWins = await spawn({ name: "Explicit", agent: "plain-agent", model: "anthropic/claude:medium" });
		assert.equal(modelFlag(explicitWins), "anthropic/claude:medium");

		writeAgentModelConfig({ version: 1, agents: {} }, agentDir);
		const parentInherits = await spawn({ name: "Plain2", agent: "plain-agent" });
		assert.equal(modelFlag(parentInherits), "anthropic/claude:high");

		const frontmatterFallback = await spawn({ name: "Front2", agent: "frontmatter-agent" });
		assert.equal(modelFlag(frontmatterFallback), "front/matter:high");
	} finally {
		for (const { id, pane } of launched) {
			const running = testApi.runningSubagents.get(id);
			running?.abortController?.abort();
			testApi.runningSubagents.delete(id);
			try {
				closeSurface(pane);
			} catch {
				// The watcher's abort cleanup may have already closed this pane.
			}
		}
		process.chdir(previousCwd);
		restoreEnvVar("PI_CODING_AGENT_DIR", previousAgentDir);
		rmSync(root, { recursive: true, force: true });
	}
});

function agentModelsCommandContext(options: {
	selections?: Array<string | undefined | ((choices: string[]) => string | undefined)>;
	available?: unknown[];
} = {}) {
	const selections = [...(options.selections ?? [])];
	const notifications: Array<{ message: string; kind: string }> = [];
	const selectCalls: Array<{ title: string; choices: string[] }> = [];
	const ctx = {
		hasUI: true,
		ui: {
			select: async (title: string, choices: string[]) => {
				selectCalls.push({ title, choices });
				const respond = selections.shift();
				return typeof respond === "function" ? respond(choices) : respond;
			},
			notify: (message: string, kind: string) => notifications.push({ message, kind }),
		},
		scopedModels: [],
		modelRegistry: { getAvailable: () => options.available ?? [POLICY_MODEL, OTHER_MODEL] },
		model: POLICY_MODEL,
		thinkingLevel: "high",
	};
	return { ctx, notifications, selectCalls };
}

function findAgentModelsCommand(registeredCommands: AnyRecord[]): AnyRecord {
	const command = registeredCommands.find((entry) => entry.name === "agent-models");
	assert.ok(command);
	return command;
}

test("/agent-models requires interactive UI and never opens a picker without it", async () => {
	await withIsolatedAgentEnv(async () => {
		const command = findAgentModelsCommand(createMockExtensionApi().registeredCommands);
		const { ctx, notifications, selectCalls } = agentModelsCommandContext();
		(ctx as AnyRecord).hasUI = false;
		await command.handler("", ctx);
		assert.equal(selectCalls.length, 0);
		assert.equal(notifications.length, 1);
		assert.match(notifications[0].message, /needs interactive UI/);
	});
});

test("/agent-models lists discovered agents with current values and annotations", async () => {
	await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
		const agentDir = dirname(globalAgentsDir);
		writeAgentModelConfig({ version: 1, agents: { scout: "anthropic/claude:high" } }, agentDir);
		const command = findAgentModelsCommand(createMockExtensionApi().registeredCommands);
		const { ctx, selectCalls } = agentModelsCommandContext({ selections: ["Done"] });
		await command.handler("", ctx);
		assert.equal(selectCalls.length, 1);
		const choices = selectCalls[0].choices;
		assert.ok(choices.includes("scout — anthropic/claude:high"), choices.join("\n"));
		assert.ok(choices.includes("claude-code — parent default · frontmatter only"), choices.join("\n"));
		assert.ok(choices.includes("planner — parent default"), choices.join("\n"));
		assert.ok(choices.includes("task-writer — parent default"), choices.join("\n"));
		assert.ok(choices.includes("executor — parent default"), choices.join("\n"));
		assert.ok(choices.includes("reviewer — parent default"), choices.join("\n"));
		assert.ok(choices.includes("worker — parent default"), choices.join("\n"));
		assert.equal(choices[choices.length - 1], "Done");
		assert.equal(readAgentModelConfig(agentDir).status, "ok");
	});
});

test("/agent-models set persists a registry-validated default immediately", async () => {
	await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
		const agentDir = dirname(globalAgentsDir);
		const command = findAgentModelsCommand(createMockExtensionApi().registeredCommands);
		const { ctx, notifications, selectCalls } = agentModelsCommandContext({
			selections: [
				"scout — parent default",
				"Set model",
				(choices: string[]) => choices.find((label: string) => label.startsWith("openai/gpt")),
				"high",
				"Done",
			],
		});
		await command.handler("", ctx);
		const read = readAgentModelConfig(agentDir);
		assert.ok(read.status === "ok");
		if (read.status === "ok") {
			assert.deepEqual(read.config, { version: 1, agents: { scout: "openai/gpt:high" } });
			assert.equal(statSync(read.path).mode & 0o777, 0o600);
		}
		assert.ok(notifications.some((entry) => /Default model for scout/.test(entry.message)));
		// Both model dialogs name the agent being configured; no current
		// default exists yet, so no row carries the marker.
		assert.equal(selectCalls[2].title, "Default model for scout");
		assert.equal(selectCalls[3].title, "Thinking for scout — openai/gpt");
		assert.ok(!selectCalls[2].choices.some((label: string) => label.includes("· current")));
	});
});

test("/agent-models set marks the agent's current default in the model list", async () => {
	await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
		const agentDir = dirname(globalAgentsDir);
		writeAgentModelConfig({ version: 1, agents: { scout: "anthropic/claude:high" } }, agentDir);
		const command = findAgentModelsCommand(createMockExtensionApi().registeredCommands);
		const { ctx, selectCalls } = agentModelsCommandContext({
			selections: [
				"scout — anthropic/claude:high",
				"Set model",
				(choices: string[]) => choices.find((label: string) => label.includes("· current")),
				"high",
				"Done",
			],
		});
		await command.handler("", ctx);
		assert.equal(selectCalls[2].title, "Default model for scout");
		const modelChoices = selectCalls[2].choices;
		const marked = modelChoices.filter((label: string) => label.includes("· current"));
		assert.equal(marked.length, 1, modelChoices.join("\n"));
		assert.ok(marked[0].startsWith("anthropic/claude"));
		assert.equal(selectCalls[3].title, "Thinking for scout — anthropic/claude");
		const read = readAgentModelConfig(agentDir);
		assert.ok(read.status === "ok");
		if (read.status === "ok") {
			assert.deepEqual(read.config, { version: 1, agents: { scout: "anthropic/claude:high" } });
		}
	});
});

test("/agent-models clear removes one entry and keeps the rest", async () => {
	await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
		const agentDir = dirname(globalAgentsDir);
		writeAgentModelConfig(
			{ version: 1, agents: { scout: "anthropic/claude:high", worker: "openai/gpt" } },
			agentDir,
		);
		const command = findAgentModelsCommand(createMockExtensionApi().registeredCommands);
		const { ctx, notifications } = agentModelsCommandContext({
			selections: ["scout — anthropic/claude:high", "Clear", "Done"],
		});
		await command.handler("", ctx);
		const read = readAgentModelConfig(agentDir);
		assert.ok(read.status === "ok");
		assert.deepEqual(
			read.status === "ok" ? read.config : null,
			{ version: 1, agents: { worker: "openai/gpt" } },
		);
		assert.ok(notifications.some((entry) => /Cleared the default model for scout/.test(entry.message)));
	});
});

test("/agent-models offers only Back for cli agents and cancel exits unchanged", async () => {
	await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
		const agentDir = dirname(globalAgentsDir);
		const command = findAgentModelsCommand(createMockExtensionApi().registeredCommands);
		const cliCtx = agentModelsCommandContext({
			selections: ["claude-code — parent default · frontmatter only", "Back", undefined],
		});
		await command.handler("", cliCtx.ctx);
		assert.deepEqual(cliCtx.selectCalls[1].choices, ["Back"]);
		assert.equal(readAgentModelConfig(agentDir).status, "missing");
	});
});

test("/agent-models surfaces unwritable config files with the symlink caveat", async () => {
	await withIsolatedAgentEnv(async ({ globalAgentsDir }) => {
		const agentDir = dirname(globalAgentsDir);
		chmodSync(agentDir, 0o500);
		try {
			const command = findAgentModelsCommand(createMockExtensionApi().registeredCommands);
			const { ctx, notifications } = agentModelsCommandContext({
				selections: ["scout — parent default", "Set model", "openai/gpt · GPT · 100k", "high", "Done"],
			});
			await command.handler("", ctx);
			assert.ok(
				notifications.some((entry) => entry.kind === "error" && /real writable file/.test(entry.message)),
				JSON.stringify(notifications),
			);
			assert.equal(readAgentModelConfig(agentDir).status, "missing");
		} finally {
			chmodSync(agentDir, 0o700);
		}
	});
});

test("/agent-models keys entries by the filename-based spawn identifier", async () => {
	await withIsolatedAgentEnv(async ({ projectAgentsDir, globalAgentsDir }) => {
		const agentDir = dirname(globalAgentsDir);
		writeAgentFile(projectAgentsDir, "hero", "name: different-name\nauto-exit: true");
		const command = findAgentModelsCommand(createMockExtensionApi().registeredCommands);
		const { ctx, selectCalls } = agentModelsCommandContext({
			selections: [
				"hero (different-name) — parent default",
				"Set model",
				"openai/gpt · GPT · 100k",
				"high",
				"Done",
			],
		});
		await command.handler("", ctx);
		const read = readAgentModelConfig(agentDir);
		assert.ok(read.status === "ok");
		assert.deepEqual(
			read.status === "ok" ? read.config : null,
			{ version: 1, agents: { hero: "openai/gpt:high" } },
		);
		const choices = selectCalls[0].choices;
		assert.ok(choices.includes("hero (different-name) — parent default"), choices.join("\n"));
	});
});

test("spawn config lookup keys by the filename identifier, not the frontmatter name", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	try {
		await withIsolatedAgentEnv(async ({ projectAgentsDir, globalAgentsDir }) => {
			const agentDir = dirname(globalAgentsDir);
			writeAgentFile(projectAgentsDir, "hero", "name: different-name\nauto-exit: true");
			const { registeredTools } = createMockExtensionApi();
			const tool = registeredTools.find((entry) => entry.name === "subagent");
			assert.ok(tool);
			const ctx = policyContext({
				modelRegistry: { getAvailable: () => [POLICY_MODEL, OTHER_MODEL] },
			});

			writeAgentModelConfig({ version: 1, agents: { hero: "missing/gone:high" } }, agentDir);
			const byFileName: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute("c", { name: "H", task: "t", agent: "hero" }, undefined, undefined, ctx),
			);
			assert.equal(byFileName.details.error, "agent model config resolution failed");
			assert.match(byFileName.content[0].text, /Agent "hero"/);

			writeAgentModelConfig(
				{ version: 1, agents: { "different-name": "missing/gone:high" } },
				agentDir,
			);
			const byFrontmatterName: AnyRecord = await executeWithoutSubagentIdentity(() =>
				tool.execute("c", { name: "H", task: "t", agent: "hero" }, undefined, undefined, ctx),
			);
			assert.equal(byFrontmatterName.details.error, "tmux not available");
		});
	} finally {
		restoreEnvVar("TMUX", previous);
	}
});

test("resume model policies use sidecar state, explicit values, and legacy fallback", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-policy-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);
		const ctx = policyContext();

		const missing = join(dir, "missing.jsonl");
		assert.equal(
			(await tool.execute("c", { sessionPath: missing }, undefined, undefined, ctx)).details.error,
			"session not found",
		);

		const legacy = join(dir, "legacy.jsonl");
		writeFileSync(legacy, "{}\n");
		assert.equal(
			(await tool.execute("c", { sessionPath: legacy }, undefined, undefined, ctx)).details.error,
			"tmux not available",
		);
		assert.match(
			(await tool.execute(
				"c",
				{ sessionPath: legacy, model: "previous" },
				undefined,
				undefined,
				ctx,
			)).content[0].text,
			/no previous model selection/,
		);

		const sidecar = writeResumeSidecar(dir);
		for (const params of [{}, { model: "previous" }, { model: "parent" }]) {
			assert.equal(
				(await tool.execute(
					"c",
					{ sessionPath: sidecar, ...params },
					undefined,
					undefined,
					ctx,
				)).details.error,
				"tmux not available",
			);
		}
		assert.match(
			(await tool.execute(
				"c",
				{ sessionPath: sidecar, model: "pick" },
				undefined,
				undefined,
				ctx,
			)).content[0].text,
			/needs interactive UI/,
		);
		assert.match(
			(await tool.execute(
				"c",
				{ sessionPath: sidecar, model: "missing/model:high" },
				undefined,
				undefined,
				ctx,
			)).content[0].text,
			/not authenticated and available/,
		);

		const invalid = join(dir, "invalid.jsonl");
		writeFileSync(invalid, "{}\n");
		writeFileSync(`${invalid}.subagent.json`, "{}");
		assert.equal(
			(await tool.execute("c", { sessionPath: invalid }, undefined, undefined, ctx)).details.error,
			"invalid launch profile",
		);
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("legacy resumes warn once and still use the legacy model path", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-legacy-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);
		const notifications: Array<[string, string]> = [];
		const ctx = policyContext({
			ui: {
				notify: (text: string, level: string) => notifications.push([text, level]),
				select: async () => undefined,
			},
		});
		const legacy = join(dir, "legacy.jsonl");
		writeFileSync(legacy, "{}\n");
		const result = await tool.execute("c", { sessionPath: legacy }, undefined, undefined, ctx);
		assert.equal(result.details.error, "tmux not available");
		assert.equal(notifications.length, 1);
		assert.equal(notifications[0][1], "warning");
		assert.match(notifications[0][0], /reduced fidelity/);
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ordinary resource changes notify and continue, while primary skill changes require a choice", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-resources-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);
		const notifications: Array<[string, string]> = [];
		const choices: Array<string> = [];
		const presentedChoices: Array<Array<string>> = [];
		const ctx = policyContext({
			ui: {
				notify: (text: string, level: string) => notifications.push([text, level]),
				select: async (_prompt: string, options: Array<string>) => {
					presentedChoices.push(options);
					return choices.shift();
				},
			},
		});

		const changedResources = join(dir, "resources.jsonl");
		writeFileSync(changedResources, "{}\n");
		const resourceProfile = testApi.buildLaunchProfile({
			displayName: "Worker",
			roleBody: "Do the work.",
			systemPromptMode: "message",
			cwd: dir,
			agentDir: dir,
			controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
			modelArgument: "anthropic/claude:high",
			originalSessionPath: changedResources,
			resources: {
				tools: fingerprintStrings(["bash"]),
				visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-08-27T12:00:00.000Z",
			},
		});
		writeLaunchProfile(changedResources, resourceProfile);
		const continued = await tool.execute(
			"c",
			{ sessionPath: changedResources },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(continued.details.error, "tmux not available");
		assert.equal(notifications.length, 1);
		assert.match(notifications[0][0], /tools changed/);

		const changedSkill = join(dir, "skill.jsonl");
		writeFileSync(changedSkill, "{}\n");
		const skillProfile = testApi.buildLaunchProfile({
			displayName: "Worker",
			roleBody: "Do the work.",
			systemPromptMode: "message",
			cwd: dir,
			agentDir: dir,
			controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
			effectiveSkills: "workflow",
			modelArgument: "anthropic/claude:high",
			originalSessionPath: changedSkill,
			resources: {
				tools: fingerprintStrings([]),
				visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-08-27T12:00:00.000Z",
			},
		});
		skillProfile.stable.primarySkill = { name: "workflow", path: "old", hash: hashText("old") };
		writeLaunchProfile(changedSkill, skillProfile);

		choices.push("Stop this resume");
		const stopped = await tool.execute(
			"c",
			{ sessionPath: changedSkill },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(stopped.details.error, "primary skill changed");
		assert.equal(testApi.runningSubagents.size, 0);

		choices.push("Resume with the older instructions");
		const older = await tool.execute(
			"c",
			{ sessionPath: changedSkill },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(older.details.error, "tmux not available");

		// The gate must offer the direct fresh same-role rollover choice too.
		const skillGateChoices = presentedChoices.at(-1);
		assert.deepEqual(skillGateChoices, [
			"Resume with the older instructions",
			"Start a fresh same-role session with the latest skill",
			"Stop this resume",
		]);
		choices.push("Start a fresh same-role session with the latest skill");
		const freshSkill = await tool.execute(
			"c",
			{ sessionPath: changedSkill },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(freshSkill.details.error, "tmux not available");
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A valid pi session whose last assistant usage reports `usageTokens`. */
function writeHeavySession(dir: string, usageTokens: number): string {
	const sessionPath = join(dir, `heavy-${Math.random().toString(16).slice(2)}.jsonl`);
	const entries = [
		{ type: "session", version: 3, id: "s", timestamp: "2026-08-27T00:00:00Z", cwd: dir },
		{
			type: "message",
			id: "u1",
			parentId: null,
			timestamp: "2026-08-27T00:00:01Z",
			message: { role: "user", content: "plan the work", timestamp: 1 },
		},
		{
			type: "message",
			id: "a1",
			parentId: "u1",
			timestamp: "2026-08-27T00:00:02Z",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "answer" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude",
				usage: {
					input: Math.max(0, usageTokens - 50),
					output: 50,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: usageTokens,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2,
			},
		},
	];
	writeFileSync(sessionPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
	return sessionPath;
}

function writeSidecarOn(sessionPath: string, dir: string): void {
	writeLaunchProfile(
		sessionPath,
		testApi.buildLaunchProfile({
			displayName: "Worker",
			roleBody: "Do the work.",
			systemPromptMode: "append",
			cwd: dir,
			agentDir: dir,
			controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
			modelArgument: "anthropic/claude:high",
			originalSessionPath: sessionPath,
			resources: {
				tools: fingerprintStrings([]),
				visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-08-27T12:00:00.000Z",
			},
		}),
	);
}

const GATE_FRESH = "Start a fresh same-role session (recommended)";
const GATE_RESUME = "Resume the saved session anyway";
const GATE_CHOOSE = "Choose another model";
const GATE_STOP = "Stop";

/** policyContext whose ui.select runs scripted responders and records choices. */
function scriptedSelectCtx(
	responses: Array<string | ((choices: string[]) => string | undefined)>,
) {
	const calls: string[][] = [];
	const titles: string[] = [];
	const ctx = policyContext({
		hasUI: true,
		ui: {
			select: async (title: string, choices: string[]) => {
				titles.push(title);
				calls.push(choices);
				const respond = responses.shift();
				if (typeof respond === "function") return respond(choices);
				return respond;
			},
			notify: async () => {},
		},
	});
	return { ctx, calls, titles };
}

test("resume context gate stays silent below 65 percent and proceeds", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-fit-low-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);
		const { ctx, calls } = scriptedSelectCtx([]);

		const light = writeHeavySession(dir, 100_000); // 50% of the 200k window
		writeSidecarOn(light, dir);
		const result = await tool.execute("c", { sessionPath: light }, undefined, undefined, ctx);
		assert.equal(result.details.error, "tmux not available");
		assert.deepEqual(calls, []);
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("resume context gate offers all four choices at and above 65 percent", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-fit-gate-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);

		const heavy = writeHeavySession(dir, 150_000); // 75% of the 200k window
		writeSidecarOn(heavy, dir);

		// "resume anyway" passes the gate and continues to the tmux check.
		const resumed = scriptedSelectCtx([GATE_RESUME]);
		const resumeResult: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy },
			undefined,
			undefined,
			resumed.ctx,
		);
		assert.equal(resumeResult.details.error, "tmux not available");
		assert.equal(resumed.calls.length, 1);
		assert.deepEqual(resumed.calls[0], [GATE_FRESH, GATE_RESUME, GATE_CHOOSE, GATE_STOP]);
		assert.equal(testApi.runningSubagents.size, 0);

		// "stop" cancels cleanly without touching the saved session.
		const heavyBeforeStop = readFileSync(heavy, "utf8");
		const stopped = scriptedSelectCtx([GATE_STOP]);
		const stopResult: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy },
			undefined,
			undefined,
			stopped.ctx,
		);
		assert.equal(stopResult.details.error, "resume cancelled at context gate");
		assert.equal(stopResult.details.contextRatio, 0.75);
		assert.match(stopResult.content[0].text, /cancelled at the context-fit gate/);
		assert.equal(readFileSync(heavy, "utf8"), heavyBeforeStop);
		assert.equal(testApi.runningSubagents.size, 0);

		// "fresh" with tmux unavailable reports the mux error before any launch.
		const fresh = scriptedSelectCtx([GATE_FRESH]);
		const freshResult: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy },
			undefined,
			undefined,
			fresh.ctx,
		);
		assert.equal(freshResult.details.error, "tmux not available");
		assert.equal(testApi.runningSubagents.size, 0);
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("gate choice 'choose another model' reopens the picker with projected ratios", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-fit-choose-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);

		const heavy = writeHeavySession(dir, 150_000);
		writeSidecarOn(heavy, dir);

		const scripted = scriptedSelectCtx([
			GATE_CHOOSE,
			(choices: string[]) => choices.find((label) => /rollover warning/.test(label)),
			(choices: string[]) => choices[0],
			GATE_STOP,
		]);
		const result: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy },
			undefined,
			undefined,
			scripted.ctx,
		);
		assert.equal(result.details.error, "resume cancelled at context gate");
		assert.equal(scripted.calls.length, 4);
		// The picker offered the model with its context window and projected ratio.
		const modelChoices = scripted.calls[1];
		assert.ok(
			modelChoices.some((label) =>
				/anthropic\/claude/.test(label) && /200k/.test(label) && /75% context · rollover warning/.test(label)),
			`picker labels missing projected ratio: ${JSON.stringify(modelChoices)}`,
		);
		// The re-selected model was gated again before the user stopped.
		assert.deepEqual(scripted.calls[3], [GATE_FRESH, GATE_RESUME, GATE_CHOOSE, GATE_STOP]);
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("resume picker titles carry the session name identically across the gate re-pick", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-prompt-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);
		const heavy = writeHeavySession(dir, 150_000); // 75% of the 200k window
		writeSidecarOn(heavy, dir);

		const currentRow = (choices: string[]) =>
			choices.find((label: string) => label.includes("· current"));
		const scripted = scriptedSelectCtx([
			currentRow, // initial pick (model: "pick")
			"high",
			GATE_CHOOSE,
			currentRow, // post-gate re-pick
			"high",
			GATE_STOP,
		]);
		const result: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy, model: "pick", name: "Stored role" },
			undefined,
			undefined,
			scripted.ctx,
		);
		assert.equal(result.details.error, "resume cancelled at context gate");
		// The sidecar's lastModel (anthropic/claude:high) marks its row.
		assert.ok(scripted.calls[0].some((label: string) => label.startsWith("anthropic/claude") && label.includes("· current")));
		// One prompt, reused verbatim by the initial pick and the re-pick.
		assert.equal(scripted.titles[0], "Resume model for Stored role");
		assert.equal(scripted.titles[1], "Thinking for Stored role — anthropic/claude");
		assert.equal(scripted.titles[3], "Resume model for Stored role");
		assert.equal(scripted.titles[4], "Thinking for Stored role — anthropic/claude");

		// Without an explicit name the stored display name becomes the subject.
		const unnamed = scriptedSelectCtx([currentRow, "high", GATE_STOP]);
		const unnamedResult: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy, model: "pick" },
			undefined,
			undefined,
			unnamed.ctx,
		);
		assert.equal(unnamedResult.details.error, "resume cancelled at context gate");
		assert.equal(unnamed.titles[0], "Resume model for Worker");
		assert.equal(unnamed.titles[1], "Thinking for Worker — anthropic/claude");
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("context gate fails safely without interactive UI and for unopenable sessions", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-fit-safety-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);

		const heavy = writeHeavySession(dir, 150_000);
		writeSidecarOn(heavy, dir);
		const offline: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy },
			undefined,
			undefined,
			policyContext(), // hasUI: false
		);
		assert.equal(offline.details.error, "context gate unavailable");
		assert.match(offline.content[0].text, /Interactive UI is required/);
		assert.equal(testApi.runningSubagents.size, 0);

		// A session pi cannot open skips the estimate and the gate entirely.
		const garbage = join(dir, "garbage.jsonl");
		writeFileSync(garbage, "{}\n");
		writeSidecarOn(garbage, dir);
		const skipped: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: garbage },
			undefined,
			undefined,
			policyContext(),
		);
		assert.equal(skipped.details.error, "tmux not available");
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("legacy heavy sessions gate on explicit models but cannot roll over without a sidecar", async () => {
	const previous = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-fit-legacy-"));
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);

		const heavy = writeHeavySession(dir, 150_000); // no sidecar
		const fresh = scriptedSelectCtx([GATE_FRESH]);
		const freshResult: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy, model: "anthropic/claude:high" },
			undefined,
			undefined,
			fresh.ctx,
		);
		assert.equal(freshResult.details.error, "rollover unavailable without sidecar");
		assert.match(freshResult.content[0].text, /launch-profile sidecar/);

		const resumed = scriptedSelectCtx([GATE_RESUME]);
		const resumeResult: AnyRecord = await tool.execute(
			"c",
			{ sessionPath: heavy, model: "anthropic/claude:high" },
			undefined,
			undefined,
			resumed.ctx,
		);
		assert.equal(resumeResult.details.error, "tmux not available");
	} finally {
		restoreEnvVar("TMUX", previous);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("resume launch restores the stored role, cwd, agent dir, and controls", { timeout: 15_000 }, async () => {
	if (!process.env.TMUX) return;
	const dir = mkdtempSync(join(tmpdir(), "pi-resume-launch-"));
	const agentDir = join(dir, "agent");
	const projectDir = join(dir, "project");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(projectDir, { recursive: true });
	let runningId: string | undefined;
	let pane: string | undefined;
	try {
		const { registeredTools } = createMockExtensionApi();
		const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
		assert.ok(tool);
		const sessionPath = join(dir, "role.jsonl");
		writeFileSync(sessionPath, "{}\n");
		writeLaunchProfile(
			sessionPath,
			testApi.buildLaunchProfile({
				displayName: "Stored role",
				agentName: "planner",
				roleBody: "Stored role body",
				systemPromptMode: "append",
				cwd: projectDir,
				agentDir,
				controls: {
					spawning: false,
					denyTools: ["bash", "write"],
					autoExit: false,
					interactive: true,
					sessionMode: "standalone",
				},
				modelArgument: "anthropic/claude:off",
				originalSessionPath: sessionPath,
				resources: {
					tools: fingerprintStrings([]),
					visibleSkills: fingerprintStrings([]),
					updatedAt: "2026-08-27T12:00:00.000Z",
				},
			}),
		);

		const result: AnyRecord = await tool.execute(
			"c",
			{ sessionPath, name: "Stored role", message: "Continue the stored role." },
			undefined,
			undefined,
			policyContext(),
		);
		assert.equal(result.details.status, "started");
		const id: string = result.details.id;
		runningId = id;
		const running = testApi.runningSubagents.get(id);
		assert.ok(running);
		pane = running.surface;
		assert.equal(running.interactive, true);

		const script = readFileSync(result.details.launchScriptFile, "utf8");
		assert.match(script, new RegExp(`cd '${escapeRegExp(projectDir)}' &&`));
		assert.ok(script.includes(`PI_CODING_AGENT_DIR='${agentDir}'`));
		assert.ok(script.includes("PI_DENY_TOOLS='bash,write'"));
		assert.ok(script.includes("PI_SUBAGENT_AGENT='planner'"));
		assert.match(script, /--append-system-prompt '[^']+'/);
		const syspromptPath = script.match(/--append-system-prompt '([^']+)'/)?.[1];
		assert.ok(syspromptPath);
		assert.equal(readFileSync(syspromptPath, "utf8"), "Stored role body");
		assert.doesNotMatch(script, /--tools /);
	} finally {
		if (runningId) {
			const id = runningId;
			const running = testApi.runningSubagents.get(id);
			running?.abortController?.abort();
			testApi.runningSubagents.delete(id);
		}
		if (pane) {
			try {
				closeSurface(pane);
			} catch {
				// The watcher's abort cleanup may have already closed this pane.
			}
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a launch failure before a usable child session removes the sidecar", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-launch-fail-"));
	const sidecarsUnder = (root: string): string[] => {
		const found: string[] = [];
		const walk = (current: string): void => {
			for (const entry of readdirSync(current, { withFileTypes: true })) {
				const path = join(current, entry.name);
				if (entry.isDirectory()) walk(path);
				else if (entry.name.endsWith(".subagent.json")) found.push(path);
			}
		};
		walk(root);
		return found;
	};
	try {
		// A surface that cannot exist makes sendLongCommand fail after the
		// profile write; the catch must remove the incomplete sidecar.
		await assert.rejects(
			testApi.launchSubagent(
				{ name: "Doomed", task: "This launch must fail." },
				{
					...policyContext({ cwd: dir }),
					sessionManager: {
						getSessionFile: () => join(dir, "parent.jsonl"),
						getSessionId: () => "launch-fail-parent",
						getSessionDir: () => dir,
					},
					cwd: dir,
					pi: undefined,
				} as any,
				{ surface: "%999999" },
			),
			);
		assert.deepEqual(sidecarsUnder(dir), [], "no incomplete sidecar may survive a failed launch");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("buildResumePiArgs adds the resolved model without changing session order", () => {
	assert.deepEqual(testApi.buildResumePiArgs("/tmp/s.jsonl"), [
		"pi",
		"--session",
		"'/tmp/s.jsonl'",
	]);
	assert.deepEqual(testApi.buildResumePiArgs("/tmp/s.jsonl", "anthropic/claude:high"), [
		"pi",
		"--session",
		"'/tmp/s.jsonl'",
		"--model",
		"'anthropic/claude:high'",
	]);
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

test("resolveResultPresentation appends compact usage after an intact, untruncated summary", () => {
	const longSummary = `Final report.\n${"x".repeat(3_000)}`;
	const usage = {
		requests: 2,
		input: 15,
		output: 26,
		total: 51,
		contextTokens: 14,
		contextWindow: 100,
		contextRatio: 0.14,
		provider: "anthropic",
		model: "claude",
		thinking: "high",
		cacheRead: 4,
		cacheWrite: 6,
		skippedInvalidUsage: 0,
	};
	const withUsage = testApi.resolveResultPresentation(
		{ exitCode: 0, elapsed: 5, summary: longSummary, sessionFile: "/tmp/s.jsonl", usage },
		"Worker",
	);
	// The model-visible final summary stays complete: no fixed size cap.
	assert.ok(withUsage.includes(longSummary));
	assert.ok(withUsage.indexOf(longSummary) < withUsage.indexOf("Usage:"));
	assert.match(withUsage, /\n\nUsage: 2 requests · input 15 · output 26 · total 51 · context 14\/1k \(14%\)/);
	assert.match(withUsage, /cache read 4 · cache write 6 · anthropic\/claude · thinking high\n\nSession: \/tmp\/s\.jsonl/);

	// Without usage the presentation is unchanged.
	const withoutUsage = testApi.resolveResultPresentation(
		{ exitCode: 0, elapsed: 5, summary: longSummary, sessionFile: "/tmp/s.jsonl" },
		"Worker",
	);
	assert.ok(withoutUsage.endsWith(`\n\nSession: /tmp/s.jsonl\nResume: pi --session /tmp/s.jsonl`));
	assert.doesNotMatch(withoutUsage, /Usage:/);
});

test("resolveUsageDetails enriches summaries with the registered context window", () => {
	const usage = { requests: 1, contextTokens: 10_000, provider: "test-provider", model: "echo", skippedInvalidUsage: 0 };
	const registry = {
		getAvailable: () => [
			{ provider: "test-provider", id: "echo", contextWindow: 200_000 },
			{ provider: "other", id: "model", contextWindow: 0 },
		],
	};
	const ctx = { modelRegistry: registry, cwd: "/tmp" } as any;
	assert.deepEqual(testApi.resolveUsageDetails({ usage }, ctx), {
		...usage,
		contextWindow: 200_000,
		contextRatio: 0.05,
	});

	// Unknown model and missing registry leave the summary unchanged.
	const unknownModel = { ...usage, model: "missing" };
	assert.equal(testApi.resolveUsageDetails({ usage: unknownModel }, ctx), unknownModel);
	assert.equal(testApi.resolveUsageDetails({ usage }, { cwd: "/tmp" } as any), usage);
	assert.equal(testApi.resolveUsageDetails({}, ctx), undefined);
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

test("subagent_result renderer shows the compact usage line once and never truncates the summary", () => {
	const { registeredMessageRenderers } = createMockExtensionApi();
	const entry = registeredMessageRenderers.find((renderer) => renderer.name === "subagent_result");
	assert.ok(entry);
	const marked = markerTheme("result");
	const usage = {
		requests: 2,
		input: 15,
		output: 26,
		total: 51,
		contextTokens: 14,
		contextWindow: 100,
		contextRatio: 0.14,
		provider: "anthropic",
		model: "claude",
		thinking: "high",
		cacheRead: 4,
		cacheWrite: 6,
		skippedInvalidUsage: 0,
	};
	const content = testApi.resolveResultPresentation(
		{ exitCode: 0, elapsed: 5, summary: "PONG\nsecond line", sessionFile: "/tmp/s.jsonl", usage },
		"Echo",
	);
	const details = { name: "Echo", exitCode: 0, elapsed: 5, sessionFile: "/tmp/s.jsonl", usage };

	const expanded = entry.renderer(
		{ customType: "subagent_result", content, details },
		{ expanded: true, outputPad: 0 },
		marked,
	);
	const expandedText = stripTerminalSequences(expanded.render(200).join("\n"));
	// The usage line renders exactly once — from details.usage, with the copy
	// appended to the model-visible content stripped for display.
	assert.equal(expandedText.split("Usage:").length - 1, 1);
	assert.match(expandedText, /Usage: 2 requests · input 15 · output 26 · total 51 · context 14\/1k \(14%\)/);
	assert.match(expandedText, /cache read 4 · cache write 6 · anthropic\/claude · thinking high/);
	assert.match(expandedText, /PONG\s*\nsecond line/);

	// Collapsed results also surface the usage/context-pressure line.
	const collapsed = entry.renderer(
		{ customType: "subagent_result", content, details },
		{ expanded: false, outputPad: 0 },
		marked,
	);
	const collapsedText = stripTerminalSequences(collapsed.render(200).join("\n"));
	assert.equal(collapsedText.split("Usage:").length - 1, 1);
	assert.match(collapsedText, /context 14\/1k \(14%\)/);

	// Without usage details the renderer shows nothing extra.
	const noUsageContent = testApi.resolveResultPresentation(
		{ exitCode: 0, elapsed: 5, summary: "PONG\nsecond line", sessionFile: "/tmp/s.jsonl" },
		"Echo",
	);
	const noUsage = entry.renderer(
		{ customType: "subagent_result", content: noUsageContent, details: { name: "Echo", exitCode: 0, elapsed: 5 } },
		{ expanded: true, outputPad: 0 },
		marked,
	);
	assert.doesNotMatch(stripTerminalSequences(noUsage.render(80).join("\n")), /Usage:/);
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

// ── pi-tasks RPC task launches (taskRuntime option) ──

/**
 * Run launchSubagent outside tmux: sendLongCommand fails after the launch
 * script is written, so the script's contents are inspectable even though the
 * launch itself rejects. Returns the script text.
 */
async function launchScriptOutsideTmux(
	params: AnyRecord,
	options: AnyRecord,
	dir: string,
): Promise<string> {
	const previousTmux = process.env.TMUX;
	delete process.env.TMUX;
	try {
		await assert.rejects(
			testApi.launchSubagent(
				params as any,
				{
					...policyContext({
						cwd: dir,
						sessionManager: {
							getSessionFile: () => join(dir, "parent.jsonl"),
							getSessionId: () => "task-launch-parent",
							getSessionDir: () => dir,
						},
					}),
					pi: undefined,
				} as any,
				options,
			),
			/tmux/,
		);
	} finally {
		if (previousTmux === undefined) delete process.env.TMUX; else process.env.TMUX = previousTmux;
	}
	const scripts: string[] = [];
	const walk = (current: string): void => {
		if (!existsSync(current)) return;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.name.endsWith(".sh")) scripts.push(path);
		}
	};
	walk(join(dir, "artifacts"));
	assert.equal(scripts.length, 1, `expected exactly one launch script, found ${scripts.length}`);
	return readFileSync(scripts[0], "utf8");
}

test("task RPC launches force autonomous auto-exit behavior, canonical model, and the turn limit", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-task-launch-"));
	try {
		// planner is interactive and non-auto-exiting — the profile the task
		// resolver rejects — proving taskRuntime forces autonomy regardless.
		const script = await launchScriptOutsideTmux(
			{ name: "Task agent", task: "Do the delegated task.", agent: "planner" },
			{
				surface: "%999999",
				resolvedModel: {
					model: POLICY_MODEL,
					selection: { provider: "test-provider", model: "echo", thinking: "high" },
					argument: "test-provider/echo:high",
					source: "explicit",
				},
				taskRuntime: { maxTurns: 3 },
			},
			dir,
		);
		assert.match(script, /PI_SUBAGENT_AUTO_EXIT=1/);
		assert.match(script, /PI_SUBAGENT_MAX_TURNS=3/);
		assert.match(script, /--model 'test-provider\/echo:high'/);
		assert.match(script, /PI_SUBAGENT_AGENT='planner'/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("task RPC launches wrap the task with the autonomous mode hint", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-task-prompt-"));
	try {
		const script = await launchScriptOutsideTmux(
			{ name: "Task agent", task: "Do the delegated task.", agent: "worker" },
			{ surface: "%999999", taskRuntime: {} },
			dir,
		);
		const artifact = script.match(/'@([^']+\.md)'/)?.[1];
		assert.ok(artifact, "task artifact path should appear in the launch script");
		const taskText = readFileSync(artifact, "utf8");
		assert.match(taskText, /Complete your task autonomously\./);
		assert.match(taskText, /FINAL assistant message should summarize what you accomplished\./);
		assert.doesNotMatch(taskText, /subagent_done/);
		assert.match(taskText, /Do the delegated task\./);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("task RPC launches without maxTurns export no turn limit", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-task-unlimited-"));
	try {
		const script = await launchScriptOutsideTmux(
			{ name: "Task agent", task: "No limit.", agent: "worker" },
			{ surface: "%999999", taskRuntime: {} },
			dir,
		);
		assert.match(script, /PI_SUBAGENT_AUTO_EXIT=1/);
		assert.doesNotMatch(script, /PI_SUBAGENT_MAX_TURNS/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("task RPC launches reject invalid maxTurns before creating a pane", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-task-bad-turns-"));
	const previousTmux = process.env.TMUX;
	delete process.env.TMUX;
	try {
		for (const maxTurns of [0, -1, 2.5, Number.NaN]) {
			await assert.rejects(
				testApi.launchSubagent(
					{ name: "Task agent", task: "x", agent: "worker" } as any,
					policyContext({
						cwd: dir,
						sessionManager: {
							getSessionFile: () => join(dir, "parent.jsonl"),
							getSessionId: () => "task-launch-parent",
							getSessionDir: () => dir,
						},
					}) as any,
					{ surface: "%999999", taskRuntime: { maxTurns } },
				),
				/Invalid task maxTurns/,
			);
		}
		assert.equal(existsSync(join(dir, "artifacts")), false, "no pane artifacts may be created");
	} finally {
		if (previousTmux === undefined) delete process.env.TMUX; else process.env.TMUX = previousTmux;
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ordinary launches keep their profile interaction, auto-exit, and prompt behavior", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-ordinary-launch-"));
	try {
		// planner (interactive, auto-exit false) keeps its interactive prompt
		// and exports no AUTO_EXIT or MAX_TURNS without taskRuntime.
		const plannerDir = join(dir, "planner");
		const plannerScript = await launchScriptOutsideTmux(
			{ name: "Planner", task: "Plan it.", agent: "planner" },
			{ surface: "%999999" },
			plannerDir,
		);
		assert.doesNotMatch(plannerScript, /PI_SUBAGENT_AUTO_EXIT/);
		assert.doesNotMatch(plannerScript, /PI_SUBAGENT_MAX_TURNS/);

		// worker (auto-exit true) keeps its autonomous behavior unchanged.
		const workerDir = join(dir, "worker");
		const workerScript = await launchScriptOutsideTmux(
			{ name: "Worker", task: "Work.", agent: "worker" },
			{ surface: "%999999" },
			workerDir,
		);
		assert.match(workerScript, /PI_SUBAGENT_AUTO_EXIT=1/);
		assert.doesNotMatch(workerScript, /PI_SUBAGENT_MAX_TURNS/);
		// No resolvedModel: the parent session model (with its thinking level)
		// flows through the ordinary path exactly as before.
		assert.match(workerScript, /--model 'anthropic\/claude:high'/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ── pi-tasks RPC bridge wiring (root session lifecycle) ──

function createRecordingEventBus() {
	const handlers = new Map<string, Set<(data: unknown) => void>>();
	const log: Array<{ channel: string; data: unknown }> = [];
	const bus = {
		on(channel: string, handler: (data: unknown) => void) {
			let set = handlers.get(channel);
			if (!set) {
				set = new Set();
				handlers.set(channel, set);
			}
			set.add(handler);
			return () => set?.delete(handler);
		},
		emit(channel: string, data: unknown) {
			log.push({ channel, data });
			for (const handler of handlers.get(channel) ?? []) handler(data);
		},
		handlers,
		log,
	};
	return bus;
}

function createTaskBridgeMockApi(events: ReturnType<typeof createRecordingEventBus>) {
	const api = {
		on() {},
		registerTool() {},
		registerCommand() {},
		registerMessageRenderer() {},
		registerShortcut() {},
		sendUserMessage() {},
		sendMessage() {},
		getAllTools() {
			return [];
		},
		events: events,
	};
	return api as any;
}

function taskBridgeContext(overrides: AnyRecord = {}) {
	return {
		...policyContext(),
		hasUI: true,
		ui: { notify: () => {} },
		...overrides,
	};
}

const MANAGER_SYMBOL = Symbol.for("pi-subagents:manager");

test("root session_start wires the task RPC handlers and emits ready once", async () => {
	testApi.resetTaskRpcForTests();
	const events = createRecordingEventBus();
	const api = createTaskBridgeMockApi(events);
	const ready: unknown[] = [];
	events.on("subagents:ready", (data) => ready.push(data));
	try {
		piTmuxSubagents(api);
		// The wiring registers via pi.on("session_start"); exercise it through
		// a direct attach (the handler itself is fire-and-forget).
		await testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as any);
		assert.equal(ready.length, 1);

		// ping answers protocol v2 through the wired bus.
		const reply = await new Promise<AnyRecord>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("ping timeout")), 1_000);
			events.on("subagents:rpc:ping:reply:wired-1", (raw) => {
				clearTimeout(timer);
				resolve(raw as AnyRecord);
			});
			events.emit("subagents:rpc:ping", { requestId: "wired-1" });
		});
		assert.deepEqual(reply, { success: true, data: { version: 2 } });

		// A second attach (double-bound session_start) stays idempotent.
		await testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as never);
		assert.equal(ready.length, 1);
		const probePings = events.log.filter(
			(entry) =>
				entry.channel === "subagents:rpc:ping"
				&& typeof (entry.data as AnyRecord)?.requestId === "string"
				&& ((entry.data as AnyRecord).requestId as string).startsWith("pi-tmux-subagents-probe-"),
		).length;
		assert.equal(probePings, 1, "no extra provider probe after the handlers are live");
	} finally {
		testApi.resetTaskRpcForTests();
	}
});

test("session_shutdown unsubscribes the task RPC handlers and clears bridge state", async () => {
	testApi.resetTaskRpcForTests();
	const events = createRecordingEventBus();
	const api = createTaskBridgeMockApi(events);
	try {
		await testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as any);
		assert.ok(testApi.getAttachedTaskRpcForTests());

		testApi.shutdownPiTasksRpcBridge();
		assert.equal(testApi.getAttachedTaskRpcForTests(), null);

		events.emit("subagents:rpc:ping", { requestId: "after-shutdown" });
		assert.equal(
			events.log.filter((entry) => entry.channel === "subagents:rpc:ping:reply:after-shutdown")
				.length,
			0,
			"no handler may answer after shutdown",
		);
	} finally {
		testApi.resetTaskRpcForTests();
	}
});

test("a child session never wires the task RPC handlers", async () => {
	testApi.resetTaskRpcForTests();
	const events = createRecordingEventBus();
	const api = createTaskBridgeMockApi(events);
	const previousId = process.env.PI_SUBAGENT_ID;
	process.env.PI_SUBAGENT_ID = "child-9";
	try {
		await testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as any);
		assert.equal(testApi.getAttachedTaskRpcForTests(), null);
		assert.equal(
			events.log.some((entry) => entry.channel === "subagents:ready"),
			false,
		);
		assert.equal(
			events.log.some((entry) => entry.channel.startsWith("subagents:rpc:")),
			false,
			"child sessions must not even probe the RPC channels",
		);
	} finally {
		if (previousId === undefined) delete process.env.PI_SUBAGENT_ID;
		else process.env.PI_SUBAGENT_ID = previousId;
		testApi.resetTaskRpcForTests();
	}
});

test("an existing pi-subagents manager makes the bridge abstain with one notice", async () => {
	testApi.resetTaskRpcForTests();
	const events = createRecordingEventBus();
	const api = createTaskBridgeMockApi(events);
	const notices: string[] = [];
	(globalThis as Record<symbol, unknown>)[MANAGER_SYMBOL] = { spawn: () => {} };
	try {
		await testApi.attachPiTasksRpcBridge(
			api,
			taskBridgeContext({ ui: { notify: (message: string) => notices.push(message) } }) as any,
		);
		assert.equal(testApi.getAttachedTaskRpcForTests(), null);
		assert.equal(notices.length, 1);
		assert.match(notices[0], /pi-subagents provider/);
		assert.equal(
			events.log.some((entry) => entry.channel === "subagents:ready"),
			false,
		);
	} finally {
		delete (globalThis as Record<symbol, unknown>)[MANAGER_SYMBOL];
		testApi.resetTaskRpcForTests();
	}
});

test("a stale attach settling mid-transition cannot admit a duplicate handler set", async () => {
	testApi.resetTaskRpcForTests();
	const events = createRecordingEventBus();
	const api = createTaskBridgeMockApi(events);
	const ready: unknown[] = [];
	events.on("subagents:ready", (data) => ready.push(data));
	try {
		// Session 1's attach is still awaiting its provider probe when the
		// session transitions.
		const stale = testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as never);
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Shutdown invalidates the stale attempt; the next session's attach is
		// in flight before the stale one settles (its probe resolves later).
		testApi.shutdownPiTasksRpcBridge();
		const replacement = testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as never);
		await new Promise((resolve) => setTimeout(resolve, 10));

		// A third attach while the replacement is pending is a no-op, and must
		// stay a no-op after the stale attempt settles: its finally hook may not
		// clear the replacement's in-flight marker (which would admit a fourth,
		// duplicate provider registration).
		await testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as never);
		await stale;
		await testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as never);
		await replacement;

		assert.ok(testApi.getAttachedTaskRpcForTests());
		// The stale attempt's registration emits ready before the wiring discards
		// it; what matters is that only ONE handler set stays live (single probe
		// per real attempt, single reply below).
		assert.ok(ready.length >= 1, "at least the replacement registration is live");
		const probes = events.log.filter(
			(entry) =>
				entry.channel === "subagents:rpc:ping"
				&& String((entry.data as AnyRecord)?.requestId ?? "").startsWith(
					"pi-tmux-subagents-probe-",
				),
		).length;
		assert.equal(probes, 2, "no-op attach attempts must not probe again");

		const replies: unknown[] = [];
		events.on("subagents:rpc:ping:reply:single-3", () => replies.push(null));
		events.emit("subagents:rpc:ping", { requestId: "single-3" });
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(replies.length, 1, "exactly one provider may answer a request");
	} finally {
		testApi.resetTaskRpcForTests();
	}
});

test("resolveAndLaunchTaskRpc validates the agent profile before any pane work", async () => {
	testApi.resetTaskRpcForTests();
	const previousTmux = process.env.TMUX;
	delete process.env.TMUX;
	const dir = mkdtempSync(join(tmpdir(), "pi-task-resolve-"));
	try {
		const api = createTaskBridgeMockApi(createRecordingEventBus());
		const ctx = {
			...taskBridgeContext(),
			cwd: dir,
			sessionManager: {
				getSessionFile: () => join(dir, "parent.jsonl"),
				getSessionId: () => "task-resolve-parent",
				getSessionDir: () => dir,
			},
		};
		await assert.rejects(
			testApi.resolveAndLaunchTaskRpc(api, ctx as any, {
				type: "Explroe",
				prompt: "do it",
				options: { isBackground: true },
			}),
			/Unknown task agent type "Explroe"/,
		);

		// A valid profile with an interactive-true profile is rejected too.
		await assert.rejects(
			testApi.resolveAndLaunchTaskRpc(api, ctx as any, {
				type: "planner",
				prompt: "do it",
				options: { isBackground: true },
			}),
			/interactive: true/,
		);

		// A valid autonomous profile resolves and only then fails at the tmux
		// boundary (outside tmux), proving validation order: profile first,
		// model next, pane last.
		await assert.rejects(
			testApi.resolveAndLaunchTaskRpc(api, ctx as any, {
				type: "general-purpose",
				prompt: "do it",
				options: { isBackground: true },
			}),
			/tmux/,
		);

		// No parent model and no configured/default model: hard failure, not a
		// silent inherit.
		await assert.rejects(
			testApi.resolveAndLaunchTaskRpc(
				api,
				{ ...ctx, model: undefined, modelRegistry: { getAvailable: () => [] } } as any,
				{
					type: "general-purpose",
					prompt: "do it",
					options: { isBackground: true },
				},
			),
			/No model for task agent "general-purpose"/,
		);
	} finally {
		if (previousTmux === undefined) delete process.env.TMUX; else process.env.TMUX = previousTmux;
		testApi.resetTaskRpcForTests();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a shutdown during the in-flight provider probe discards the late registration", async () => {
	testApi.resetTaskRpcForTests();
	const events = createRecordingEventBus();
	const api = createTaskBridgeMockApi(events);
	try {
		// Start the attach (its provider probe waits for the timeout) and tear
		// the session down before the probe resolves.
		const attaching = testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as never);
		testApi.shutdownPiTasksRpcBridge();
		await attaching;

		assert.equal(testApi.getAttachedTaskRpcForTests(), null);
		// The late registration was discarded: no handler answers afterwards.
		events.emit("subagents:rpc:ping", { requestId: "raced-shutdown" });
		assert.equal(
			events.log.filter((entry) => entry.channel === "subagents:rpc:ping:reply:raced-shutdown")
				.length,
			0,
			"a shutdown-invalidated attach must not leave live handlers",
		);

		// The next session can attach normally (the epoch did not wedge it).
		await testApi.attachPiTasksRpcBridge(api, taskBridgeContext() as never);
		assert.ok(testApi.getAttachedTaskRpcForTests());
	} finally {
		testApi.resetTaskRpcForTests();
	}
});
