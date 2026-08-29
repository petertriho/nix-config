import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeSurface, createSurface, pollForExit, sendLongCommand } from "./tmux.ts";
import piTmuxSubagentsModule, { __test__ as testApi } from "./index.ts";
import {
	fingerprintStrings,
	hashText,
	type LaunchProfile,
	readLaunchProfile,
	writeLaunchProfile,
} from "./launch-profile.ts";
import {
	makeWorkflowModelPreset,
	readWorkflowModelPreset,
	type WorkflowPresetRoles,
	writeWorkflowModelPreset,
} from "./workflow-preset.ts";
import {
	buildReReviewLaunch,
	chooseReReviewAction,
	RE_REVIEW_STOP_LABEL,
} from "./workflow-rereview.ts";

const insideTmux = !!process.env.TMUX;

test(
	"tmux pane lifecycle: create, run a command, detect the sentinel, close",
	{ skip: !insideTmux && "TMUX is not set", timeout: 30_000 },
	async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-it-"));
		let pane: string | undefined;
		try {
			pane = createSurface("it-echo");
			assert.match(pane, /^%\d+$/);
			// Give the shell in the new pane time to start before sending keys.
			await new Promise((resolve) => setTimeout(resolve, 1500));

			sendLongCommand(pane, "true; echo '__SUBAGENT_DONE_'$?'__'", {
				scriptPath: join(dir, "cmd.sh"),
			});
			const result = await pollForExit(pane, AbortSignal.timeout(20_000), { interval: 200 });
			assert.deepEqual(result, { reason: "sentinel", exitCode: 0 });
		} finally {
			if (pane) {
				closeSurface(pane);
				const panes = execFileSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"], {
					encoding: "utf8",
				})
					.split("\n")
					.map((line) => line.trim());
				assert.equal(panes.includes(pane), false, `pane ${pane} still listed`);
			}
			rmSync(dir, { recursive: true, force: true });
		}
	},
);

test(
	"subagent launch writes a valid launch-profile sidecar",
		{ skip: !insideTmux && "TMUX is not set", timeout: 30_000 },
		async () => {
			const root = mkdtempSync(join(tmpdir(), "pi-subagent-profile-it-"));
			const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
			process.env.PI_CODING_AGENT_DIR = join(root, "agent");
			let pane: string | undefined;
			let runningId: string | undefined;
			try {
				pane = createSurface("it-profile");
				runningId = undefined;
				const running = await testApi.launchSubagent(
					{ name: "Profile probe", task: "Exit immediately after reading this message." },
					{
						sessionManager: {
							getSessionFile: () => join(root, "parent.jsonl"),
							getSessionId: () => "integration-parent",
							getSessionDir: () => root,
						},
					cwd: root,
					model: { provider: "test-provider", id: "echo", contextWindow: 128_000 } as any,
					thinkingLevel: "off",
					},
					{
						surface: pane,
						resolvedModel: {
							model: { provider: "test-provider", id: "echo", contextWindow: 128_000 } as any,
							selection: { provider: "test-provider", model: "echo", thinking: "off" },
							argument: "test-provider/echo:off",
							source: "picker",
						},
						workflow: {
							phase: "planner",
							policy: "per-role",
							assignmentSource: "preset",
							projectRoot: root,
							originalDefault: { provider: "test-provider", model: "echo", thinking: "off" },
							currentDefault: { provider: "test-provider", model: "echo", thinking: "off" },
							artifacts: {},
						},
					},
				);
				runningId = running.id;
				const sidecar = readLaunchProfile(running.sessionFile);
				assert.equal(sidecar.status, "ok");
				if (sidecar.status !== "ok") return;
				assert.equal(sidecar.profile.stable.displayName, "Profile probe");
				assert.equal(sidecar.profile.stable.cwd, root);
				assert.equal(sidecar.profile.stable.originalSessionPath, running.sessionFile);
				assert.deepEqual(sidecar.profile.runtime.originalModel, {
					provider: "test-provider",
					model: "echo",
					thinking: "off",
				});
				assert.deepEqual(sidecar.profile.runtime.lastModel, sidecar.profile.runtime.originalModel);
				assert.equal(sidecar.profile.workflow?.phase, "planner");
				assert.equal(sidecar.profile.workflow?.policy, "per-role");
				assert.equal(sidecar.profile.workflow?.assignmentSource, "preset");
				assert.deepEqual(sidecar.profile.workflow?.originalDefault, {
					provider: "test-provider",
					model: "echo",
					thinking: "off",
				});
				assert.deepEqual(sidecar.profile.workflow?.currentDefault, sidecar.profile.workflow?.originalDefault);
			} finally {
				if (runningId) testApi.runningSubagents.delete(runningId);
				if (pane) closeSurface(pane);
				if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
				else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
				rmSync(root, { recursive: true, force: true });
			}
		},
);

// ── Context-fit gate and fresh same-role rollover (T5) ──

const GATE_MODEL = {
	provider: "test-provider",
	id: "echo",
	name: "Echo",
	api: "openai-completions",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200_000,
	maxTokens: 8_000,
} as any;

const GATE_FRESH = "Start a fresh same-role session (recommended)";
const GATE_RESUME = "Resume the saved session anyway";

function writeHeavySession(dir: string, usageTokens = 150_000): string {
	const sessionPath = join(dir, "heavy.jsonl");
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
				api: "openai-completions",
				provider: "test-provider",
				model: "echo",
				usage: {
					input: usageTokens - 50,
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

/**
 * Append a completed assistant response to a session file, the way a real
 * child does before it exits. Recovery bookkeeping must require it.
 */
function appendAssistantResponse(sessionPath: string, text: string): void {
	appendFileSync(
		sessionPath,
		`${JSON.stringify({
			type: "message",
			id: `a-${Math.random().toString(16).slice(2, 8)}`,
			parentId: "u1",
			timestamp: "2026-08-27T00:00:09Z",
			message: {
				role: "assistant",
				content: [{ type: "text", text }],
				stopReason: "stop",
				timestamp: 9,
			},
		})}\n`,
	);
}

/** Seed a fresh child session file with one completed assistant response. */
function writeChildSessionWithResponse(sessionPath: string, text: string): void {
	const entries = [
		{ type: "session", version: 3, id: "child", timestamp: "2026-08-27T00:00:05Z", cwd: tmpdir() },
		{
			type: "message",
			id: "cu1",
			parentId: null,
			timestamp: "2026-08-27T00:00:06Z",
			message: { role: "user", content: "continue", timestamp: 6 },
		},
	];
	writeFileSync(sessionPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
	appendAssistantResponse(sessionPath, text);
}

function writeHeavySidecar(input: {
	sessionPath: string;
	cwd: string;
	agentDir: string;
	role?: { name: string; displayName: string; roleBody: string };
	primarySkill?: { name: string; path: string; hash: string };
	workflow?: LaunchProfile["workflow"];
}): void {
	const role = input.role ?? {
		name: "implementer",
		displayName: "Implementer",
		roleBody: "You are the implementer. Follow TASKS.md exactly.",
	};
	writeLaunchProfile(
		input.sessionPath,
		testApi.buildLaunchProfile({
			displayName: role.displayName,
			agentName: role.name,
			roleBody: role.roleBody,
			systemPromptMode: "append",
			cwd: input.cwd,
			agentDir: input.agentDir,
			controls: {
				spawning: false,
				denyTools: ["subagent"],
				autoExit: true,
				interactive: false,
				sessionMode: "standalone",
			},
			modelArgument: "test-provider/echo:off",
			originalSessionPath: input.sessionPath,
			resources: {
				tools: fingerprintStrings([]),
				visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-08-27T12:00:00.000Z",
			},
			...(input.workflow ? { workflow: input.workflow } : {}),
		}),
	);
	if (input.primarySkill) {
		const read = readLaunchProfile(input.sessionPath);
		assert.equal(read.status, "ok");
		if (read.status === "ok") {
			read.profile.stable.primarySkill = input.primarySkill;
			writeLaunchProfile(input.sessionPath, read.profile);
		}
	}
}

function gateContext(gateChoice: string) {
	return {
		sessionManager: {
			getSessionFile: () => "/tmp/parent.jsonl",
			getSessionId: () => "integration-parent",
			getSessionDir: () => "/tmp",
		},
		cwd: "/tmp",
		model: GATE_MODEL,
		thinkingLevel: "off" as const,
		scopedModels: [],
		modelRegistry: { getAvailable: () => [GATE_MODEL] },
		hasUI: true,
		ui: {
			select: async (_title: string, choices: string[]) => {
				assert.ok(choices.includes(gateChoice), `unexpected select choices: ${choices.join(", ")}`);
				return gateChoice;
			},
			notify: async () => {},
		},
	};
}

function scrubPiEnv(): { saved: Record<string, string>; restore: () => void } {
	const ambient = Object.keys(process.env).filter((key) => key.startsWith("PI_"));
	const saved = Object.fromEntries(ambient.map((key) => [key, process.env[key]!]));
	for (const key of ambient) delete process.env[key];
	return {
		saved,
		restore: () => {
			for (const [key, value] of Object.entries(saved)) process.env[key] = value;
		},
	};
}

function registerToolsForTests(): { tools: any[]; restoreEnv: () => void } {
	const tools: any[] = [];
	// Scrub ambient PI_* env (e.g. PI_DENY_TOOLS or PI_SUBAGENT_AGENT from the
	// parent harness) so registration AND execution see the same hermetic
	// environment as every other test. The caller restores via restoreEnv().
	const { restore } = scrubPiEnv();
	try {
		piTmuxSubagentsModule({
			on() {},
			registerTool(tool: any) {
				tools.push(tool);
			},
			registerCommand() {},
			registerMessageRenderer() {},
			registerShortcut() {},
			sendUserMessage() {},
			sendMessage() {},
			getAllTools: () => [],
		} as any);
	} catch (error) {
		restore();
		throw error;
	}
	return { tools, restoreEnv: restore };
}

test(
	"resume-anyway passes the 65% context gate and resumes the saved session",
		{ skip: !insideTmux && "TMUX is not set", timeout: 30_000 },
		async () => {
			const root = mkdtempSync(join(tmpdir(), "pi-resume-anyway-it-"));
			let pane: string | undefined;
			let runningId: string | undefined;
			const { tools: registeredTools, restoreEnv } = registerToolsForTests();
			try {
				const sessionPath = writeHeavySession(root);
				writeHeavySidecar({ sessionPath, cwd: root, agentDir: root });

				const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
				assert.ok(tool);

				const result = await tool.execute(
					"c",
					{ sessionPath, name: "Heavy resume" },
					undefined,
					undefined,
					gateContext(GATE_RESUME),
				);
				assert.equal(result.details.status, "started");
				assert.equal(result.details.rollover, undefined);
				const resumeId: string = result.details.id;
				runningId = resumeId;
				const running = testApi.runningSubagents.get(resumeId);
				assert.ok(running);
				pane = running.surface;
				assert.equal(running.sessionFile, sessionPath);

				const script = readFileSync(result.details.launchScriptFile, "utf8");
				assert.ok(script.includes(`--session '${sessionPath}'`));
				assert.ok(script.includes("--model 'test-provider/echo:off'"));

				// No rollover lineage was recorded for a resume-anyway path.
				const sidecar = readLaunchProfile(sessionPath);
				assert.equal(sidecar.status, "ok");
				if (sidecar.status === "ok") {
					assert.equal(sidecar.profile.lineage, undefined);
				}
			} finally {
				if (runningId) {
					const running = testApi.runningSubagents.get(runningId);
					running?.abortController?.abort();
					testApi.runningSubagents.delete(runningId);
				}
				if (pane) {
					try {
					closeSurface(pane);
					} catch {
						// Watcher cleanup may have closed it already.
					}
				}
				rmSync(root, { recursive: true, force: true });
				restoreEnv();
			}
		},
);

test(
	"fresh rollover starts a standalone same-role child with lineage and workflow handoff",
		{ skip: !insideTmux && "TMUX is not set", timeout: 30_000 },
		async () => {
			const root = mkdtempSync(join(tmpdir(), "pi-rollover-it-"));
			const projectDir = join(root, "project");
			const agentDir = join(root, "agent");
			const skillDir = join(agentDir, "skills", "workflow");
			mkdirSync(projectDir, { recursive: true });
			mkdirSync(skillDir, { recursive: true });
			const skillBody = "# Workflow skill\n\nLatest body.\n";
			writeFileSync(join(skillDir, "SKILL.md"), skillBody);
			let pane: string | undefined;
			let runningId: string | undefined;
			const { tools: registeredTools, restoreEnv } = registerToolsForTests();
			try {
			const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
			assert.ok(tool);

			const sessionPath = writeHeavySession(root);
			writeHeavySidecar({
				sessionPath,
				cwd: projectDir,
				agentDir,
				primarySkill: {
					name: "workflow",
					path: join(skillDir, "SKILL.md"),
					hash: hashText(skillBody),
				},
				workflow: {
					phase: "implementer",
					policy: "per-role",
					assignmentSource: "preset",
					projectRoot: projectDir,
					originalDefault: { provider: "test-provider", model: "echo", thinking: "off" },
					currentDefault: { provider: "test-provider", model: "echo", thinking: "off" },
					artifacts: {
						plan: join(projectDir, ".artifacts", "demo", "PLAN.md"),
						tasks: join(projectDir, ".artifacts", "demo", "TASKS.md"),
						review: join(projectDir, ".artifacts", "demo", "REVIEW.md"),
						baseRef: "abc123",
					},
				},
			});
			const heavyBefore = readFileSync(sessionPath, "utf8");

			const result = await tool.execute(
				"c",
				{ sessionPath, message: "Continue from the first unchecked task." },
				undefined,
				undefined,
				gateContext(GATE_FRESH),
			);
			assert.equal(result.details.status, "started");
			assert.equal(result.details.rollover, "fresh");
			assert.equal(result.details.originalSessionPath, sessionPath);
			const replacement = result.details.replacementSessionPath as string;
			assert.ok(replacement);
			assert.notEqual(replacement, sessionPath);
			const rolloverId: string = result.details.id;
			runningId = rolloverId;
			const running = testApi.runningSubagents.get(rolloverId);
			assert.ok(running);
			pane = running.surface;
			assert.equal(running.sessionFile, replacement);

			// The saved conversation is untouched: rollover is not a fork or resume.
			assert.equal(readFileSync(sessionPath, "utf8"), heavyBefore);

			const script = readFileSync(result.details.launchScriptFile, "utf8");
			assert.ok(script.includes(`cd '${projectDir}'`));
			assert.ok(script.includes(`PI_CODING_AGENT_DIR='${agentDir}'`));
			assert.ok(script.includes("PI_DENY_TOOLS='subagent'"));
			assert.ok(script.includes("PI_SUBAGENT_AGENT='implementer'"));
			assert.ok(script.includes("PI_SUBAGENT_AUTO_EXIT=1"));
				assert.match(script, /--append-system-prompt '[^']+'/);
				const syspromptPath = script.match(/--append-system-prompt '([^']+)'/)?.[1];
				assert.ok(syspromptPath);
				assert.equal(
					readFileSync(syspromptPath, "utf8"),
					"You are the implementer. Follow TASKS.md exactly.",
				);
			// The latest primary skill is re-expanded for the replacement.
			assert.ok(script.includes("/skill:workflow "));
			// The role-correct handoff artifacts reach the child prompt.
			assert.ok(script.includes(join(projectDir, ".artifacts", "demo", "PLAN.md")));
			assert.ok(script.includes(join(projectDir, ".artifacts", "demo", "TASKS.md")));
			assert.ok(script.includes(join(projectDir, ".artifacts", "demo", "REVIEW.md")));
			assert.ok(script.includes("abc123"));
			assert.ok(script.includes("Continue from the first unchecked task."));
			// No conversation fork: the launch never points at the saved session.
			assert.ok(!script.includes(`--session '${sessionPath}'`));

			const replacementProfile = readLaunchProfile(replacement);
			assert.equal(replacementProfile.status, "ok");
			if (replacementProfile.status === "ok") {
				const next = replacementProfile.profile;
				assert.equal(next.stable.displayName, "Implementer");
				assert.equal(next.stable.agentName, "implementer");
				assert.equal(next.stable.roleBody, "You are the implementer. Follow TASKS.md exactly.");
				assert.equal(next.stable.cwd, projectDir);
				assert.equal(next.stable.agentDir, agentDir);
				assert.deepEqual(next.stable.controls.denyTools, ["subagent"]);
				assert.equal(next.stable.controls.sessionMode, "standalone");
				assert.equal(next.lineage?.rolledOverFrom, sessionPath);
				// The latest primary skill hash is captured fresh.
				assert.equal(next.stable.primarySkill?.name, "workflow");
				assert.equal(next.stable.primarySkill?.hash, hashText(skillBody));
				assert.deepEqual(next.runtime.originalModel, {
					provider: "test-provider",
					model: "echo",
					thinking: "off",
				});
				assert.equal(next.workflow?.phase, "implementer");
				assert.equal(next.workflow?.artifacts.baseRef, "abc123");
				assert.deepEqual(next.workflow?.currentDefault, {
					provider: "test-provider",
					model: "echo",
					thinking: "off",
				});
			}

			const oldProfile = readLaunchProfile(sessionPath);
			assert.equal(oldProfile.status, "ok");
			if (oldProfile.status === "ok") {
				assert.equal(oldProfile.profile.lineage?.rolledOverTo, replacement);
			}
			} finally {
				if (runningId) {
					const running = testApi.runningSubagents.get(runningId);
					running?.abortController?.abort();
					testApi.runningSubagents.delete(runningId);
				}
				if (pane) {
					try {
					closeSurface(pane);
					} catch {
						// Watcher cleanup may have closed it already.
					}
				}
				rmSync(root, { recursive: true, force: true });
				restoreEnv();
			}
		},
);

// ── Workflow provider-failure recovery (T6) ──

const RECOVER_SELECT = "Select a replacement model and thinking level";
const RECOVERY_REPLACEMENT = {
	provider: "other",
	id: "replacement",
	name: "Replacement",
	api: "openai-completions",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200_000,
	maxTokens: 8_000,
} as any;

const QUOTA_FAILURE = "You exceeded your current quota, please check your plan and billing details";

function registerToolsWithMessages(): {
	tools: any[];
	sentMessages: any[];
	restoreEnv: () => void;
} {
	const tools: any[] = [];
	const sentMessages: any[] = [];
	const { restore } = scrubPiEnv();
	try {
		piTmuxSubagentsModule({
			on() {},
			registerTool(tool: any) {
				tools.push(tool);
			},
			registerCommand() {},
			registerMessageRenderer() {},
			registerShortcut() {},
			sendUserMessage() {},
			sendMessage(message: any) {
				sentMessages.push(message);
			},
			getAllTools: () => [],
		} as any);
	} catch (error) {
		restore();
		throw error;
	}
	return { tools, sentMessages, restoreEnv: restore };
}

async function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.fail("condition not met within timeout");
}

function recoveryContext(responses: Array<string | ((choices: string[]) => string | undefined)>) {
	const queue = [...responses];
	return {
		sessionManager: {
			getSessionFile: () => "/tmp/parent.jsonl",
			getSessionId: () => "integration-parent",
			getSessionDir: () => "/tmp",
		},
		cwd: "/tmp",
		model: GATE_MODEL,
		thinkingLevel: "off" as const,
		scopedModels: [],
		modelRegistry: { getAvailable: () => [GATE_MODEL, RECOVERY_REPLACEMENT] },
		hasUI: true,
		ui: {
			select: async (_title: string, choices: string[]) => {
				const respond = queue.shift();
				return typeof respond === "function" ? respond(choices) : respond;
			},
			notify: async () => {},
		},
	};
}

function pickReplacement(choices: string[]): string | undefined {
	return choices.find((label) => /other\/replacement/.test(label));
}

function workflowAssignments() {
	return {
		planner: { provider: "test-provider", model: "echo", thinking: "off" as const },
		taskWriter: { provider: "test-provider", model: "echo", thinking: "off" as const },
		implementer: { provider: "test-provider", model: "echo", thinking: "off" as const },
		reviewer: { provider: "test-provider", model: "echo", thinking: "off" as const },
	};
}

test(
	"same-session recovery resumes with the picked model and updates the role default",
		{ skip: !insideTmux && "TMUX is not set", timeout: 40_000 },
	async (t) => {
			const root = mkdtempSync(join(tmpdir(), "pi-recover-resume-it-"));
			let pane: string | undefined;
			let runningId: string | undefined;
			testApi.setActiveWorkflowRuntimeForTests(null);
			try {
				const agentDir = join(root, "agent");
				const projectDir = join(root, "project");
				mkdirSync(agentDir, { recursive: true });
				mkdirSync(projectDir, { recursive: true });
				const previousAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
				process.env.PI_CODING_AGENT_DIR = agentDir;

				// A deliberate saved preset that recovery must never modify.
				const presetRoles = workflowAssignments();
				writeWorkflowModelPreset(
					makeWorkflowModelPreset(projectDir, presetRoles, new Date("2026-08-26T12:00:00Z")),
					agentDir,
				);

				testApi.setActiveWorkflowRuntimeForTests({
					policy: "per-role",
					assignmentSource: "preset",
					projectRoot: projectDir,
					roleAssignments: presetRoles,
					currentAssignments: presetRoles,
					updatedAt: "2026-08-27T12:00:00.000Z",
				});

				const { tools, sentMessages, restoreEnv } = registerToolsWithMessages();
				t.after(restoreEnv);
				const recoverTool = tools.find((entry) => entry.name === "subagent_recover");
				assert.ok(recoverTool);

				const sessionPath = writeHeavySession(root, 100_000); // 50%: resume fits
				writeHeavySidecar({
					sessionPath,
					cwd: projectDir,
					agentDir,
					workflow: {
						phase: "implementer",
						policy: "per-role",
						assignmentSource: "preset",
						projectRoot: projectDir,
						originalDefault: presetRoles.implementer,
						currentDefault: presetRoles.implementer,
						artifacts: { plan: join(projectDir, "PLAN.md") },
					},
				});

				const result = await recoverTool.execute(
					"c",
					{ sessionPath, failure: QUOTA_FAILURE, message: "Continue from the first unchecked task." },
					undefined,
					undefined,
					recoveryContext([RECOVER_SELECT, pickReplacement, "medium"]),
				);
				assert.equal(result.details.status, "started");
				assert.equal(result.details.sessionPath, sessionPath);
				assert.deepEqual(result.details.recovery, { phase: "implementer", failureKind: "usage" });
				const watcherId: string = result.details.id;
				runningId = watcherId;
				const running = testApi.runningSubagents.get(watcherId);
				assert.ok(running);
				pane = running.surface;
				const script = readFileSync(result.details.launchScriptFile, "utf8");
				assert.ok(script.includes(`--session '${sessionPath}'`));
				assert.ok(script.includes("--model 'other/replacement:medium'"));

				// Simulate the successful replacement: the child appends a completed
				// assistant response, then exits through the .exit sidecar. The sidecar
				// must be written only after the launch assertions, or the watcher
				// completes and removes itself from runningSubagents before they run.
				appendAssistantResponse(sessionPath, "Continued from the first unchecked task.");
				writeFileSync(`${sessionPath}.exit`, JSON.stringify({ type: "done" }));

				await waitFor(() =>
					testApi.getActiveWorkflowRuntime()?.currentAssignments?.implementer?.model === "replacement",
				);
				const state = testApi.getActiveWorkflowRuntime();
				assert.deepEqual(state?.currentAssignments?.implementer, {
					provider: "other",
					model: "replacement",
					thinking: "medium",
				});
				// The deliberate assignments and the saved preset are untouched.
				assert.deepEqual(state?.roleAssignments?.implementer, presetRoles.implementer);
				const preset = readWorkflowModelPreset(projectDir, agentDir);
				assert.equal(preset.status, "ok");
				if (preset.status === "ok") {
					assert.equal(preset.preset.updatedAt, "2026-08-26T12:00:00.000Z");
					assert.equal(preset.preset.roles.implementer.provider, "test-provider");
				}

				// The saved profile records the recovery and the new last model.
				await waitFor(() => sentMessages.some((message) => message.customType === "subagent_result"));
				const recoveryMessage = sentMessages.find(
					(message) => message.customType === "subagent_result",
				);
				// T9: the resume result exposes the provider-neutral usage summary,
				// enriched with the registered context window of test-provider/echo.
				// Cache fields are reported even when zero because the provider
				// reported them; nothing here drives control flow.
				assert.deepEqual(recoveryMessage.details.usage, {
					requests: 2,
					input: 99_950,
					output: 50,
					total: 100_000,
					contextTokens: 100_000,
					contextWindow: 200_000,
					contextRatio: 0.5,
					provider: "test-provider",
					model: "echo",
					thinking: "off",
					cacheRead: 0,
					cacheWrite: 0,
					skippedInvalidUsage: 0,
				});
				assert.match(
					recoveryMessage.content,
					/Usage: 2 requests · input 99,950 · output 50 · total 100,000 · context 100,000\/200k \(50%\)/,
				);
				const sidecar = readLaunchProfile(sessionPath);
				assert.equal(sidecar.status, "ok");
				if (sidecar.status === "ok") {
					assert.equal(sidecar.profile.runtime.previousFailure?.kind, "usage");
					assert.deepEqual(sidecar.profile.runtime.lastModel, {
						provider: "other",
						model: "replacement",
						thinking: "medium",
					});
					assert.equal(sidecar.profile.runtime.resumeCount, 1);
				}

				if (previousAgentDirEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
				else process.env.PI_CODING_AGENT_DIR = previousAgentDirEnv;
			} finally {
				testApi.setActiveWorkflowRuntimeForTests(null);
				if (runningId) {
					const running = testApi.runningSubagents.get(runningId);
					running?.abortController?.abort();
					testApi.runningSubagents.delete(runningId);
				}
				if (pane) {
					try {
						closeSurface(pane);
					} catch {
						// Watcher cleanup may have closed it already.
					}
				}
				rmSync(root, { recursive: true, force: true });
			}
		},
);

test(
	"an exit-0 recovery with no new assistant response does not commit replacement state",
	{ skip: !insideTmux && "TMUX is not set", timeout: 40_000 },
	async (t) => {
		const root = mkdtempSync(join(tmpdir(), "pi-recover-silent-it-"));
		let pane: string | undefined;
		let runningId: string | undefined;
		testApi.setActiveWorkflowRuntimeForTests(null);
		try {
			const agentDir = join(root, "agent");
			const projectDir = join(root, "project");
			mkdirSync(agentDir, { recursive: true });
			mkdirSync(projectDir, { recursive: true });
			const previousAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
			process.env.PI_CODING_AGENT_DIR = agentDir;

			const presetRoles = workflowAssignments();
			writeWorkflowModelPreset(
				makeWorkflowModelPreset(projectDir, presetRoles, new Date("2026-08-26T12:00:00Z")),
				agentDir,
			);
			testApi.setActiveWorkflowRuntimeForTests({
				policy: "per-role",
				assignmentSource: "preset",
				projectRoot: projectDir,
				roleAssignments: presetRoles,
				currentAssignments: presetRoles,
				updatedAt: "2026-08-27T12:00:00.000Z",
			});

			const { tools, sentMessages, restoreEnv } = registerToolsWithMessages();
			t.after(restoreEnv);
			const recoverTool = tools.find((entry) => entry.name === "subagent_recover");
			assert.ok(recoverTool);

			const sessionPath = writeHeavySession(root, 100_000); // 50%: resume fits
			writeHeavySidecar({
				sessionPath,
				cwd: projectDir,
				agentDir,
				workflow: {
					phase: "implementer",
					policy: "per-role",
					assignmentSource: "preset",
					projectRoot: projectDir,
					originalDefault: presetRoles.implementer,
					currentDefault: presetRoles.implementer,
					artifacts: { plan: join(projectDir, "PLAN.md") },
				},
			});

			const result = await recoverTool.execute(
				"c",
				{ sessionPath, failure: QUOTA_FAILURE, message: "Continue from the first unchecked task." },
				undefined,
				undefined,
				recoveryContext([RECOVER_SELECT, pickReplacement, "medium"]),
			);
			assert.equal(result.details.status, "started");
			const watcherId: string = result.details.id;
			runningId = watcherId;
			const running = testApi.runningSubagents.get(watcherId);
			assert.ok(running);
			pane = running.surface;

			// Exit 0 without any new assistant entry: a silent process is not a
			// successful response, so nothing below may update.
			writeFileSync(`${sessionPath}.exit`, JSON.stringify({ type: "done" }));
			await waitFor(() =>
				sentMessages.some((message) => message.customType === "subagent_result"),
			);

			const state = testApi.getActiveWorkflowRuntime();
			assert.equal(state?.currentAssignments?.implementer?.model, "echo");
			const sidecar = readLaunchProfile(sessionPath);
			assert.equal(sidecar.status, "ok");
			if (sidecar.status === "ok") {
				assert.deepEqual(sidecar.profile.runtime.lastModel, {
					provider: "test-provider",
					model: "echo",
					thinking: "off",
				});
				assert.equal(sidecar.profile.runtime.resumeCount, 0);
			}

			if (previousAgentDirEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDirEnv;
		} finally {
			testApi.setActiveWorkflowRuntimeForTests(null);
			if (runningId) {
				const running = testApi.runningSubagents.get(runningId);
				running?.abortController?.abort();
				testApi.runningSubagents.delete(runningId);
			}
			if (pane) {
				try {
					closeSurface(pane);
				} catch {
					// Watcher cleanup may have closed it already.
				}
			}
			rmSync(root, { recursive: true, force: true });
		}
	},
);

test(
	"rollover recovery replaces the active session path and pins the recovered default",
		{ skip: !insideTmux && "TMUX is not set", timeout: 40_000 },
	async (t) => {
			const root = mkdtempSync(join(tmpdir(), "pi-recover-rollover-it-"));
			let pane: string | undefined;
			let runningId: string | undefined;
			testApi.setActiveWorkflowRuntimeForTests(null);
			try {
				const agentDir = join(root, "agent");
				const projectDir = join(root, "project");
				mkdirSync(agentDir, { recursive: true });
				mkdirSync(projectDir, { recursive: true });
				const previousAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
				process.env.PI_CODING_AGENT_DIR = agentDir;

				const presetRoles = workflowAssignments();
				writeWorkflowModelPreset(
					makeWorkflowModelPreset(projectDir, presetRoles, new Date("2026-08-26T12:00:00Z")),
					agentDir,
				);
				testApi.setActiveWorkflowRuntimeForTests({
					policy: "per-role",
					assignmentSource: "preset",
					projectRoot: projectDir,
					roleAssignments: presetRoles,
					currentAssignments: presetRoles,
					updatedAt: "2026-08-27T12:00:00.000Z",
				});

				const { tools, restoreEnv } = registerToolsWithMessages();
				t.after(restoreEnv);
				const recoverTool = tools.find((entry) => entry.name === "subagent_recover");
				assert.ok(recoverTool);

				const sessionPath = writeHeavySession(root, 150_000); // 75%: rollover gate
				const heavyBefore = readFileSync(sessionPath, "utf8");
				writeHeavySidecar({
					sessionPath,
					cwd: projectDir,
					agentDir,
					workflow: {
						phase: "implementer",
						policy: "per-role",
						assignmentSource: "preset",
						projectRoot: projectDir,
						originalDefault: presetRoles.implementer,
						currentDefault: presetRoles.implementer,
						artifacts: { tasks: join(projectDir, "TASKS.md"), baseRef: "abc123" },
					},
				});

				const result = await recoverTool.execute(
					"c",
					{ sessionPath, failure: QUOTA_FAILURE, message: "Continue implementation from artifacts." },
					undefined,
					undefined,
					recoveryContext([RECOVER_SELECT, pickReplacement, "medium", GATE_FRESH]),
				);
				assert.equal(result.details.status, "started");
				assert.equal(result.details.rollover, "fresh");
				assert.equal(result.details.replacementSessionPath !== sessionPath, true);
				const replacement: string = result.details.replacementSessionPath;
				const watcherId: string = result.details.id;
				runningId = watcherId;
				const running = testApi.runningSubagents.get(watcherId);
				assert.ok(running);
				pane = running.surface;

				// Simulate the successful replacement: a fresh child session with a
				// completed assistant response, then the .exit sidecar.
				writeChildSessionWithResponse(replacement, "Continued implementation from artifacts.");
				writeFileSync(`${replacement}.exit`, JSON.stringify({ type: "done" }));

				await waitFor(() =>
					testApi.getActiveWorkflowRuntime()?.currentAssignments?.implementer?.model === "replacement",
				);
				const state = testApi.getActiveWorkflowRuntime();
				// The workflow's active session path now points at the replacement.
				assert.equal(state?.activeSessions?.implementer, replacement);
				assert.deepEqual(state?.currentAssignments?.implementer, {
					provider: "other",
					model: "replacement",
					thinking: "medium",
				});
				assert.deepEqual(state?.roleAssignments?.implementer, presetRoles.implementer);

				// The saved preset keeps the deliberate assignment.
				const preset = readWorkflowModelPreset(projectDir, agentDir);
				assert.equal(preset.status, "ok");
				if (preset.status === "ok") {
					assert.equal(preset.preset.roles.implementer.provider, "test-provider");
					assert.equal(preset.preset.updatedAt, "2026-08-26T12:00:00.000Z");
				}

				// The replaced conversation is untouched; lineage links both sides.
				assert.equal(readFileSync(sessionPath, "utf8"), heavyBefore);
				const replacementProfile = readLaunchProfile(replacement);
				assert.equal(replacementProfile.status, "ok");
				if (replacementProfile.status === "ok") {
					assert.equal(replacementProfile.profile.lineage?.rolledOverFrom, sessionPath);
					assert.equal(replacementProfile.profile.workflow?.assignmentSource, "recovery");
					assert.deepEqual(replacementProfile.profile.workflow?.currentDefault, {
						provider: "other",
						model: "replacement",
						thinking: "medium",
					});
					assert.equal(replacementProfile.profile.runtime.previousFailure?.kind, "usage");
				}
				const oldProfile = readLaunchProfile(sessionPath);
				assert.equal(oldProfile.status, "ok");
				if (oldProfile.status === "ok") {
					assert.equal(oldProfile.profile.lineage?.rolledOverTo, replacement);
					assert.equal(oldProfile.profile.workflow?.assignmentSource, "preset");
				}

				if (previousAgentDirEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
				else process.env.PI_CODING_AGENT_DIR = previousAgentDirEnv;
			} finally {
				testApi.setActiveWorkflowRuntimeForTests(null);
				if (runningId) {
					const running = testApi.runningSubagents.get(runningId);
					running?.abortController?.abort();
					testApi.runningSubagents.delete(runningId);
				}
				if (pane) {
					try {
						closeSurface(pane);
					} catch {
						// Watcher cleanup may have closed it already.
					}
				}
				rmSync(root, { recursive: true, force: true });
			}
		},
);

test(
	"workflow phase spawns record their session path, and provider failures report a failure kind",
		{ skip: !insideTmux && "TMUX is not set", timeout: 40_000 },
	async (t) => {
			const root = mkdtempSync(join(tmpdir(), "pi-recover-spawn-it-"));
			let pane: string | undefined;
			let runningId: string | undefined;
			testApi.setActiveWorkflowRuntimeForTests(null);
			try {
				const agentDir = join(root, "agent");
				const projectDir = join(root, "project");
				mkdirSync(agentDir, { recursive: true });
				mkdirSync(projectDir, { recursive: true });
				const previousAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
				process.env.PI_CODING_AGENT_DIR = agentDir;

				const assignments = workflowAssignments();
				testApi.setActiveWorkflowRuntimeForTests({
					policy: "per-role",
					assignmentSource: "configured",
					projectRoot: projectDir,
					roleAssignments: assignments,
					currentAssignments: assignments,
					updatedAt: "2026-08-27T12:00:00.000Z",
				});

				const { tools, sentMessages, restoreEnv } = registerToolsWithMessages();
				t.after(restoreEnv);
				const subagentTool = tools.find((entry) => entry.name === "subagent");
				assert.ok(subagentTool);

				const result = await subagentTool.execute(
					"c",
					{ name: "Planner", task: "Plan the demo.", agent: "planner" },
					undefined,
					undefined,
					recoveryContext([]),
				);
				assert.equal(result.details.status, "started");
				const watcherId: string = result.details.id;
				runningId = watcherId;
				const sessionFile: string = result.details.sessionFile;
				const running = testApi.runningSubagents.get(watcherId);
				assert.ok(running);
				pane = running.surface;

				// The fresh workflow spawn is recorded as the planner's active session.
				const state = testApi.getActiveWorkflowRuntime();
				assert.equal(state?.activeSessions?.planner, sessionFile);

				// A surfaced provider error is classified in the result details.
				writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "error", errorMessage: QUOTA_FAILURE }));
				await waitFor(() =>
					sentMessages.some((message) => message.customType === "subagent_result"),
				);
				const failure = sentMessages.find((message) => message.customType === "subagent_result");
				assert.equal(failure.details.failureKind, "usage");
				assert.equal(failure.details.errorMessage, QUOTA_FAILURE);
				// A failure before any completed assistant turn carries no usage summary.
				assert.equal(failure.details.usage, undefined);

				if (previousAgentDirEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
				else process.env.PI_CODING_AGENT_DIR = previousAgentDirEnv;
			} finally {
				testApi.setActiveWorkflowRuntimeForTests(null);
				if (runningId) {
					const running = testApi.runningSubagents.get(runningId);
					running?.abortController?.abort();
					testApi.runningSubagents.delete(runningId);
				}
				if (pane) {
					try {
					closeSurface(pane);
					} catch {
						// Watcher cleanup may have closed it already.
					}
				}
				rmSync(root, { recursive: true, force: true });
			}
		},
);

test(
	"spawn results expose the same normalized usage summary with compact presentation",
		{ skip: !insideTmux && "TMUX is not set", timeout: 40_000 },
	async (t) => {
			const root = mkdtempSync(join(tmpdir(), "pi-usage-spawn-it-"));
			let pane: string | undefined;
			let runningId: string | undefined;
			try {
				const { tools, sentMessages, restoreEnv } = registerToolsWithMessages();
				t.after(restoreEnv);
				const subagentTool = tools.find((entry) => entry.name === "subagent");
				assert.ok(subagentTool);

				const result = await subagentTool.execute(
					"c",
					{ name: "Usage probe", task: "Produce usage entries." },
					undefined,
					undefined,
					recoveryContext([]),
				);
				assert.equal(result.details.status, "started");
				const watcherId: string = result.details.id;
				runningId = watcherId;
				const sessionFile: string = result.details.sessionFile;
				const running = testApi.runningSubagents.get(watcherId);
				assert.ok(running);
				pane = running.surface;

				// Let the launched child settle first: the real pi process may remove
				// the seeded session file at startup. Wait briefly for that churn to
				// finish, then write the synthetic completed turns the watcher will
				// aggregate — two assistant turns, one complete and one partial,
				// both reporting cache fields.
				const settleDeadline = Date.now() + 3_000;
				while (Date.now() < settleDeadline && existsSync(sessionFile)) {
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				const entries = [
					{
						type: "message",
						id: "u1",
						parentId: null,
						timestamp: "2026-08-27T00:00:01Z",
						message: { role: "user", content: "go", timestamp: 1 },
					},
					{
						type: "message",
						id: "a1",
						parentId: "u1",
						timestamp: "2026-08-27T00:00:02Z",
						message: {
								role: "assistant",
								content: [{ type: "text", text: "first turn" }],
								api: "openai-completions",
								provider: "test-provider",
								model: "echo",
								usage: {
									input: 900,
									output: 100,
									cacheRead: 30,
									cacheWrite: 0,
									totalTokens: 1_030,
									cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
								},
								stopReason: "toolUse",
								thinkingLevel: "off",
								timestamp: 2,
							},
					},
					{
						type: "message",
						id: "a2",
						parentId: "a1",
						timestamp: "2026-08-27T00:00:03Z",
						message: {
								role: "assistant",
								content: [{ type: "text", text: "Planned." }],
								api: "openai-completions",
								provider: "test-provider",
								model: "echo",
								usage: {
									cacheRead: 5,
									cacheWrite: 7,
									totalTokens: 12,
									cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
								},
								stopReason: "stop",
								thinkingLevel: "off",
								timestamp: 3,
							},
					},
				];
				writeFileSync(
					sessionFile,
					entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
				);

				// Complete the simulated child run.
				writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "done" }));

				await waitFor(() =>
					sentMessages.some((message) => message.customType === "subagent_result"),
				);
				const completion = sentMessages.find(
					(message) => message.customType === "subagent_result",
				);
				// T9: the spawn result carries the same normalized usage structure as
				// resume results — partial fields aggregate, cache fields appear only
				// because both turns reported them, and the latest entry fixes the
				// context tokens. The registry model adds window and ratio.
				assert.deepEqual(completion.details.usage, {
					requests: 2,
					input: 900,
					output: 100,
					total: 1_042,
					contextTokens: 12,
					contextWindow: 200_000,
					contextRatio: 12 / 200_000,
					provider: "test-provider",
					model: "echo",
					thinking: "off",
					cacheRead: 35,
					cacheWrite: 7,
					skippedInvalidUsage: 0,
				});
				// The model-visible final summary stays intact and the compact usage
				// line follows it.
				assert.match(completion.content, /Planned\./);
				assert.match(
					completion.content,
					/Usage: 2 requests · input 900 · output 100 · total 1,042 · context 12\/200k \(0%\)/,
				);
			} finally {
				if (runningId) {
					const running = testApi.runningSubagents.get(runningId);
					running?.abortController?.abort();
					testApi.runningSubagents.delete(runningId);
				}
				if (pane) {
					try {
					closeSurface(pane);
					} catch {
						// Watcher cleanup may have closed it already.
					}
				}
				rmSync(root, { recursive: true, force: true });
			}
		},
);

// ── Explicit re-review selection (T8) ──

function reReviewArtifacts(projectDir: string) {
	const plan = join(projectDir, ".artifacts", "demo", "PLAN.md");
	const tasks = join(projectDir, ".artifacts", "demo", "TASKS.md");
	const review = join(projectDir, ".artifacts", "demo", "REVIEW.md");
	return {
		paths: { planPath: plan, tasksPath: tasks, reviewPath: review },
		artifacts: { plan, tasks, review, baseRef: "abc123" },
	};
}

test(
	"re-review resume-previous resumes the stored reviewer session with its saved selection and gates",
	{ skip: !insideTmux && "TMUX is not set", timeout: 30_000 },
	async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-rereview-resume-it-"));
		let pane: string | undefined;
		let runningId: string | undefined;
		const { tools: registeredTools, restoreEnv } = registerToolsForTests();
		try {
			const projectDir = join(root, "project");
			const agentDir = join(root, "agent");
			mkdirSync(projectDir, { recursive: true });
			const artifacts = reReviewArtifacts(projectDir);

			// 75% of the 200k window: the context-fit gate must stay available.
			const sessionPath = writeHeavySession(root, 150_000);
			writeHeavySidecar({
				sessionPath,
				cwd: projectDir,
				agentDir,
				role: {
					name: "reviewer",
					displayName: " Reviewer",
					roleBody: "You are the review agent of the /workflow chain.",
				},
				workflow: {
					phase: "reviewer",
					policy: "per-role",
					assignmentSource: "preset",
					projectRoot: projectDir,
					originalDefault: { provider: "test-provider", model: "echo", thinking: "off" },
					currentDefault: { provider: "test-provider", model: "echo", thinking: "off" },
					artifacts: artifacts.artifacts,
				},
			});

			const tool = registeredTools.find((entry) => entry.name === "subagent_resume");
			assert.ok(tool);

			const launch = buildReReviewLaunch("resume", {
				...artifacts.paths,
				baseRef: "abc123",
				fixSummary: "Fixed both CRITICAL findings.",
			});
			assert.equal(launch.choice, "resume");
			if (launch.choice !== "resume") return;

			// No model override: the answered gate keeps the resume going and the
			// sidecar's stored reviewer selection drives the launch.
			const result = await tool.execute(
				"c",
				{ sessionPath, name: " Reviewer", message: launch.message },
				undefined,
				undefined,
				gateContext(GATE_RESUME),
			);
			assert.equal(result.details.status, "started");
			assert.equal(result.details.rollover, undefined);
			const resumeId: string = result.details.id;
			runningId = resumeId;
			const running = testApi.runningSubagents.get(resumeId);
			assert.ok(running);
			pane = running.surface;
			assert.equal(running.sessionFile, sessionPath);

			const script = readFileSync(result.details.launchScriptFile, "utf8");
			assert.ok(script.includes(`--session '${sessionPath}'`));
			assert.ok(script.includes("--model 'test-provider/echo:off'"));

			// The re-review message carries the full review context, with the
			// previous REVIEW.md as optional input.
			const messageFile = script.match(/# Resume message file: (.+)/)?.[1];
			assert.ok(messageFile);
			const message = readFileSync(messageFile, "utf8");
			for (const expected of [
				`Base ref: abc123.`,
				`PLAN.md: ${artifacts.paths.planPath}.`,
				`TASKS.md: ${artifacts.paths.tasksPath}.`,
				`Previous REVIEW.md (optional input): ${artifacts.paths.reviewPath}.`,
				`Write the re-review to ${artifacts.paths.reviewPath}`,
				"Fixed both CRITICAL findings.",
			]) {
				assert.ok(message.includes(expected), `resume message must include ${expected}`);
			}
		} finally {
			if (runningId) {
				const running = testApi.runningSubagents.get(runningId);
				running?.abortController?.abort();
				testApi.runningSubagents.delete(runningId);
			}
			if (pane) {
				try {
					closeSurface(pane);
				} catch {
					// Watcher cleanup may have closed it already.
				}
			}
			rmSync(root, { recursive: true, force: true });
			restoreEnv();
		}
	},
);

test(
	"re-review fresh reviewer follows the active workflow model policy",
	{ skip: !insideTmux && "TMUX is not set", timeout: 40_000 },
	async (t) => {
		const root = mkdtempSync(join(tmpdir(), "pi-rereview-fresh-it-"));
		let pane: string | undefined;
		let runningId: string | undefined;
		testApi.setActiveWorkflowRuntimeForTests(null);
		testApi.setActiveWorkflowRunIdForTests(null);
		try {
			const agentDir = join(root, "agent");
			const projectDir = join(root, "project");
			mkdirSync(agentDir, { recursive: true });
			mkdirSync(projectDir, { recursive: true });
			const previousAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
			process.env.PI_CODING_AGENT_DIR = agentDir;

			// The reviewer assignment differs from the parent selection (off), so
			// the script proves the per-role policy resolved it.
			const assignments: WorkflowPresetRoles = workflowAssignments();
			assignments.reviewer = { provider: "test-provider", model: "echo", thinking: "high" };
			testApi.setActiveWorkflowRuntimeForTests({
				policy: "per-role",
				assignmentSource: "configured",
				projectRoot: projectDir,
				roleAssignments: assignments,
				currentAssignments: assignments,
				updatedAt: "2026-08-27T12:00:00.000Z",
			});
			// A real /workflow run pins phase launches to its run token; this
			// fresh reviewer must present the matching token and artifact handoff.
			testApi.setActiveWorkflowRunIdForTests("run-a");

			const { tools, restoreEnv } = registerToolsWithMessages();
			t.after(restoreEnv);
			const subagentTool = tools.find((entry) => entry.name === "subagent");
			assert.ok(subagentTool);

			const artifacts = reReviewArtifacts(projectDir);
			const launch = buildReReviewLaunch("fresh", {
				...artifacts.paths,
				baseRef: "abc123",
				fixSummary: "Fixed the 2 CRITICAL findings.",
			});
			assert.equal(launch.choice, "fresh");
			if (launch.choice !== "fresh") return;

			// A stale run token is rejected before any launch.
			const stale = await subagentTool.execute(
				"c",
				{
					name: " Reviewer",
					agent: "reviewer",
					task: launch.task,
					workflowRunId: "run-old",
				},
				undefined,
				undefined,
				recoveryContext([]),
			);
			assert.equal(stale.details.error, "stale workflow run token");

			const result = await subagentTool.execute(
				"c",
				{
					name: " Reviewer",
					agent: "reviewer",
					task: launch.task,
					workflowRunId: "run-a",
					workflowArtifacts: {
						plan: artifacts.paths.planPath,
						tasks: artifacts.paths.tasksPath,
						review: artifacts.paths.reviewPath,
						baseRef: "abc123",
					},
				},
				undefined,
				undefined,
				recoveryContext([]),
			);
			assert.equal(result.details.status, "started");
			const watcherId: string = result.details.id;
			runningId = watcherId;
			const running = testApi.runningSubagents.get(watcherId);
			assert.ok(running);
			pane = running.surface;

			const script = readFileSync(result.details.launchScriptFile, "utf8");
			// The active per-role policy resolved the reviewer default; no model
			// override was passed and the reviewer role ran in the pane.
			assert.ok(script.includes("--model 'test-provider/echo:high'"));
			assert.ok(script.includes("PI_SUBAGENT_AGENT='reviewer'"));
			// The re-review task carries the full review context inline.
			for (const expected of [
				`Base ref: abc123.`,
				`PLAN.md: ${artifacts.paths.planPath}.`,
				`TASKS.md: ${artifacts.paths.tasksPath}.`,
				`Previous REVIEW.md (optional input): ${artifacts.paths.reviewPath}.`,
				`Write the re-review to ${artifacts.paths.reviewPath}`,
				"Fixed the 2 CRITICAL findings.",
			]) {
				assert.ok(script.includes(expected), `fresh task must include ${expected}`);
			}

			// The fresh reviewer session becomes the workflow-held reviewer path.
			assert.equal(
				testApi.getActiveWorkflowRuntime()?.activeSessions?.reviewer,
				result.details.sessionFile,
			);

			// The authoritative artifact handoff is persisted in the phase sidecar,
			// so a later recovery rollover continues from the exact paths.
			const sidecar = readLaunchProfile(result.details.sessionFile);
			assert.equal(sidecar.status, "ok");
			if (sidecar.status === "ok") {
				assert.equal(sidecar.profile.workflow?.phase, "reviewer");
				assert.equal(sidecar.profile.workflow?.artifacts.plan, artifacts.paths.planPath);
				assert.equal(sidecar.profile.workflow?.artifacts.tasks, artifacts.paths.tasksPath);
				assert.equal(sidecar.profile.workflow?.artifacts.review, artifacts.paths.reviewPath);
				assert.equal(sidecar.profile.workflow?.artifacts.baseRef, "abc123");
			}

			if (previousAgentDirEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDirEnv;
		} finally {
			testApi.setActiveWorkflowRuntimeForTests(null);
			testApi.setActiveWorkflowRunIdForTests(null);
			if (runningId) {
				const running = testApi.runningSubagents.get(runningId);
				running?.abortController?.abort();
				testApi.runningSubagents.delete(runningId);
			}
			if (pane) {
				try {
					closeSurface(pane);
				} catch {
					// Watcher cleanup may have closed it already.
				}
			}
			rmSync(root, { recursive: true, force: true });
		}
	},
);

test(
	"re-review stop and cancellation launch no reviewer at all",
	{ skip: !insideTmux && "TMUX is not set", timeout: 10_000 },
	async () => {
		testApi.setActiveWorkflowRuntimeForTests(null);
		const runningBefore = testApi.runningSubagents.size;
		const panesBefore = execFileSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"], {
			encoding: "utf8",
		})
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);

		for (const selection of [RE_REVIEW_STOP_LABEL, undefined] as const) {
			const ctx = {
				hasUI: true,
				ui: { select: async () => selection },
			} as any;
			const choice = await chooseReReviewAction(ctx);
			const launch = buildReReviewLaunch(choice, {
				...reReviewArtifacts("/tmp/project").paths,
				baseRef: "abc123",
			});
			assert.deepEqual(launch, { choice: "stop" });
			assert.equal("task" in launch || "message" in launch, false);
		}

		// Nothing was spawned: no running subagent entry, no new tmux pane.
		assert.equal(testApi.runningSubagents.size, runningBefore);
		const panesAfter = execFileSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"], {
			encoding: "utf8",
		})
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		assert.deepEqual(panesAfter, panesBefore);
	},
);
