import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { loadWorkflowDefinitionFromPackage } from "./workflow/schema.ts";
import {
	createWorkflowRunState,
	getActiveWorkflowRun,
	startWorkflowRun,
} from "./workflow/state.ts";

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
							version: 1,
							workflowId: "integration-workflow",
							runId: "run-profile",
							roleId: "architect",
							manifestHash: hashText("integration manifest"),
							skillHash: hashText("integration skill"),
							policy: "per-role",
							assignmentSource: "preset",
							projectRoot: root,
							originalDefault: { provider: "test-provider", model: "echo", thinking: "off" },
							currentDefault: { provider: "test-provider", model: "echo", thinking: "off" },
							data: {},
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
				assert.equal(sidecar.profile.workflow?.roleId, "architect");
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

function writeHeavySidecar(input: {
	sessionPath: string;
	cwd: string;
	agentDir: string;
	role?: { name: string; displayName: string; roleBody: string };
	primarySkill?: { name: string; path: string; hash: string };
	workflow?: LaunchProfile["workflow"];
}): void {
	const role = input.role ?? {
		name: "executor",
		displayName: "Executor",
		roleBody: "You are the executor. Follow TASKS.md exactly.",
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
					version: 1,
					workflowId: "implementation-flow",
					runId: "run-implementation",
					roleId: "builder",
					manifestHash: hashText("implementation manifest"),
					skillHash: hashText("implementation skill"),
					policy: "per-role",
					assignmentSource: "preset",
					projectRoot: projectDir,
					originalDefault: { provider: "test-provider", model: "echo", thinking: "off" },
					currentDefault: { provider: "test-provider", model: "echo", thinking: "off" },
					data: {
						spec: join(projectDir, ".artifacts", "demo", "SPEC.md"),
						checklist: join(projectDir, ".artifacts", "demo", "CHECKLIST.md"),
						base: "abc123",
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
			assert.ok(script.includes("PI_SUBAGENT_AGENT='executor'"));
			assert.ok(script.includes("PI_SUBAGENT_AUTO_EXIT=1"));
				assert.match(script, /--append-system-prompt '[^']+'/);
				const syspromptPath = script.match(/--append-system-prompt '([^']+)'/)?.[1];
				assert.ok(syspromptPath);
				assert.equal(
					readFileSync(syspromptPath, "utf8"),
					"You are the executor. Follow TASKS.md exactly.",
				);
			// The latest primary skill is re-expanded for the replacement.
			assert.ok(script.includes("/skill:workflow "));
			// Public resume has no manifest snapshot, so it stays generic and
			// does not infer or expose workflow data. Dedicated workflow_resume
			// supplies the role-specific handoff in workflow tool tests.
			assert.ok(script.includes("manifest workflow runtime owns role-specific handoff data"));
			assert.ok(!script.includes(join(projectDir, ".artifacts", "demo", "SPEC.md")));
			assert.ok(!script.includes("abc123"));
			assert.ok(script.includes("Continue from the first unchecked task."));
			// No conversation fork: the launch never points at the saved session.
			assert.ok(!script.includes(`--session '${sessionPath}'`));

			const replacementProfile = readLaunchProfile(replacement);
			assert.equal(replacementProfile.status, "ok");
			if (replacementProfile.status === "ok") {
				const next = replacementProfile.profile;
				assert.equal(next.stable.displayName, "Executor");
				assert.equal(next.stable.agentName, "executor");
				assert.equal(next.stable.roleBody, "You are the executor. Follow TASKS.md exactly.");
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
				assert.equal(next.workflow?.roleId, "builder");
				assert.equal(next.workflow?.data.base, "abc123");
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
			appendEntry() {},
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

function integrationContext() {
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
			select: async () => undefined,
			notify: async () => {},
		},
	};
}

function writeGenericWorkflowPackage(root: string) {
	const packageDir = join(root, "generic-workflow");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		join(packageDir, "workflow.json"),
		JSON.stringify({
			version: 1,
			id: "integration-generic",
			command: {
				name: "integration-generic",
				description: "Exercise generic workflow lifecycle tools",
			},
			skill: "SKILL.md",
			data: {
				plan: {
					kind: "file",
					label: "Plan",
					constraint: { under: ".artifacts/integration", basename: "PLAN.md" },
				},
			},
			roles: [{
				id: "architect",
				label: "Architecture specialist",
				agent: "planner",
				reads: ["plan"],
				writes: ["file:plan"],
				handoff: "Continue the architecture plan from the durable artifact.",
			}],
		}),
	);
	writeFileSync(
		join(packageDir, "SKILL.md"),
		[
			"---",
			"name: integration-generic-private",
			"description: Private integration workflow instructions.",
			"---",
			"",
			"# Integration workflow",
		].join("\n"),
	);
	const loaded = loadWorkflowDefinitionFromPackage(packageDir);
	assert.equal(loaded.status, "ok");
	if (loaded.status !== "ok") throw new Error("generic workflow fixture failed");
	return loaded.definition;
}

test(
	"generic workflow spawn persists arbitrary role state and delivers provider failure asynchronously",
	{ skip: !insideTmux && "TMUX is not set", timeout: 40_000 },
	async (t) => {
		const root = mkdtempSync(join(tmpdir(), "pi-workflow-spawn-it-"));
		let pane: string | undefined;
		let runningId: string | undefined;
		try {
			execFileSync("git", ["init", "-q", root]);
			const definition = writeGenericWorkflowPackage(root);
			const started = startWorkflowRun(
				createWorkflowRunState(),
				{
					runId: "run-generic-it",
					source: "project",
					definition,
					projectRoot: root,
					policy: "per-role",
					assignmentSource: "configured",
					originalAssignments: {
						architect: {
							provider: "test-provider",
							model: "echo",
							thinking: "off",
						},
					},
					data: {
						plan: join(root, ".artifacts", "integration", "PLAN.md"),
					},
				},
			);
			const { tools, sentMessages, restoreEnv } = registerToolsWithMessages();
			t.after(restoreEnv);
			testApi.setWorkflowRunStateForTests(started.state);
			const spawnTool = tools.find((entry) => entry.name === "workflow_spawn");
			assert.ok(spawnTool);

			const result = await spawnTool.execute(
				"c",
				{
					runId: "run-generic-it",
					role: "architect",
					task: "Draft the architecture plan.",
				},
				undefined,
				undefined,
				integrationContext(),
			);
			assert.equal(result.details.status, "started");
			runningId = result.details.id;
			if (!runningId) throw new Error("workflow_spawn did not return a running ID");
			const running = testApi.runningSubagents.get(runningId);
			assert.ok(running);
			pane = running.surface;

			const active = getActiveWorkflowRun(testApi.getWorkflowRunStateForTests());
			assert.equal(active?.roleSessions.architect?.current, result.details.sessionFile);
			assert.equal(active?.activeLaunch?.status, "running");
			const sidecar = readLaunchProfile(result.details.sessionFile);
			assert.equal(sidecar.status, "ok");
			if (sidecar.status === "ok") {
				assert.equal(sidecar.profile.workflow?.workflowId, "integration-generic");
				assert.equal(sidecar.profile.workflow?.roleId, "architect");
				assert.equal(sidecar.profile.stable.agentName, "planner");
			}

			const providerFailure =
				"You exceeded your current quota, please check your plan and billing details";
			writeFileSync(
				`${result.details.sessionFile}.exit`,
				JSON.stringify({ type: "error", errorMessage: providerFailure }),
			);
			await waitFor(() =>
				sentMessages.some((message) => message.customType === "subagent_result"),
			);
			const delivered = sentMessages.find(
				(message) => message.customType === "subagent_result",
			);
			assert.equal(delivered.details.workflow.roleId, "architect");
			assert.equal(delivered.details.failureKind, "usage");
			assert.match(delivered.content, /quota/i);
			assert.equal(
				getActiveWorkflowRun(testApi.getWorkflowRunStateForTests())?.activeLaunch?.status,
				"failed",
			);
		} finally {
			testApi.setWorkflowRunStateForTests(createWorkflowRunState());
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
					integrationContext(),
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
