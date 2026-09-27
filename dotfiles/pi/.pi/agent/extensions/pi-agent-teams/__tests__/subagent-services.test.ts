import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { __test__ as agentDefinitions } from "../index.ts";
import {
	fingerprintStrings,
	hashText,
	profilePathForSession,
	readLaunchProfile,
	updateLaunchProfile,
	writeLaunchProfile,
} from "../launch-profile.ts";
import {
	createSubagentExecutionServices,
	getDefaultSessionDirFor,
	type SubagentServiceDependencies,
} from "../subagent-services.ts";
import { shellEscape } from "../tmux.ts";
import { buildProviderFailureRecord } from "../../pi-workflows/workflow/recovery.ts";
import { attachTmuxWorkflowProvider, tmuxWorkflowProviderIO } from "../workflow-provider.ts";
import { requestWorkflowProvider, subscribeWorkflowDelivery } from "../../workflow-provider/contract.ts";

const TEST_MODEL = {
	provider: "test-provider",
	id: "echo",
	name: "Echo",
	api: "openai-completions",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100,
	maxTokens: 100,
} as any;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

async function withTempDir<T>(
	run: (root: string) => Promise<T> | T,
): Promise<T> {
	const root = mkdtempSync(join(tmpdir(), "subagent-services-"));
	const previousDelay = process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS;
	process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS = "0";
	try {
		return await run(root);
	} finally {
		if (previousDelay === undefined) delete process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS;
		else process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS = previousDelay;
		rmSync(root, { recursive: true, force: true });
	}
}

function writeSession(sessionPath: string, usageTokens = 0): void {
	const entries: Record<string, unknown>[] = [{
		type: "session",
		version: 3,
		id: "saved-session",
		timestamp: "2026-09-02T00:00:00.000Z",
		cwd: "/tmp",
	}];
	if (usageTokens > 0) {
		entries.push(
			{
				type: "message",
				id: "user-1",
				parentId: null,
				timestamp: "2026-09-02T00:00:01.000Z",
				message: { role: "user", content: "continue", timestamp: 1 },
			},
			{
				type: "message",
				id: "assistant-1",
				parentId: "user-1",
				timestamp: "2026-09-02T00:00:02.000Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "saved answer" }],
					api: "openai-completions",
					provider: TEST_MODEL.provider,
					model: TEST_MODEL.id,
					usage: {
						input: usageTokens - 1,
						output: 1,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: usageTokens,
						cost: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
					},
					stopReason: "stop",
					timestamp: 2,
				},
			},
		);
	}
	writeFileSync(
		sessionPath,
		`${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
	);
}

function createHarness(
	root: string,
	options: {
		pollForExit?: SubagentServiceDependencies["pollForExit"];
		closeSurface?: SubagentServiceDependencies["closeSurface"];
		sendLongCommand?: SubagentServiceDependencies["sendLongCommand"];
		resolveLaunchBehavior?: SubagentServiceDependencies["resolveLaunchBehavior"];
		loadAgentDefaults?: SubagentServiceDependencies["loadAgentDefaults"];
		resolveSubagentPaths?: SubagentServiceDependencies["resolveSubagentPaths"];
		getModuleAbortSignal?: SubagentServiceDependencies["getModuleAbortSignal"];
		select?: (title: string, choices: string[]) => Promise<string | undefined>;
	} = {},
) {
	const runningSubagents = new Map();
	const sentMessages: any[] = [];
	const sentCommands: Array<{ command: string; scriptPath?: string }> = [];
	const closedSurfaces: string[] = [];
	let surfaceCount = 0;
	const moduleAbort = new AbortController();
	const deps: SubagentServiceDependencies = {
		subagentsDir: root,
		getAgentConfigDir: () => root,
		normalizeSubagentParams: (params) => params,
		loadAgentDefaults: options.loadAgentDefaults ?? (() => null),
		resolveSubagentPaths: options.resolveSubagentPaths ?? (() => ({
			effectiveCwd: root,
			localAgentDir: null,
			effectiveAgentDir: root,
		})),
		resolveLaunchBehavior: options.resolveLaunchBehavior ?? (() => ({
			sessionMode: "standalone",
			seededSessionMode: null,
			inheritsConversationContext: false,
			taskDelivery: "artifact",
		})),
		resolveEffectiveInteractive: () => false,
		resolvePiModelArgument: () => `${TEST_MODEL.provider}/${TEST_MODEL.id}:off`,
		resolveDenyTools: () => new Set(),
		runningSubagents,
		observeRunningSubagent() {},
		startWidgetRefresh() {},
		startStatusRefresh() {},
		updateWidget() {},
		isTmuxAvailable: () => true,
		muxUnavailableResult: () => ({
			content: [{ type: "text", text: "tmux unavailable" }],
			details: { error: "tmux not available" },
		}),
		createSurface: () => `%${++surfaceCount}`,
		sendLongCommand(surface, command, commandOptions) {
			sentCommands.push({ command, scriptPath: commandOptions?.scriptPath });
			options.sendLongCommand?.(surface, command, commandOptions);
		},
		closeSurface: options.closeSurface ?? ((surface) => {
			closedSurfaces.push(surface);
		}),
		pollForExit: options.pollForExit
			?? (async () => ({ exitCode: 0 })),
		readScreen: () => "",
		getModuleAbortSignal: options.getModuleAbortSignal ?? (() => moduleAbort.signal),
	};
	const services = createSubagentExecutionServices(deps);
	const pi = {
		sendMessage(message: any) {
			sentMessages.push(message);
		},
		getActiveTools: () => [],
		getCommands: () => [],
	} as any;
	const ctx = {
		sessionManager: {
			getSessionFile: () => join(root, "parent.jsonl"),
			getSessionId: () => "parent",
			getSessionDir: () => root,
		},
		cwd: root,
		model: TEST_MODEL,
		thinkingLevel: "off",
		scopedModels: [],
		modelRegistry: { getAvailable: () => [TEST_MODEL] },
		hasUI: true,
		ui: {
			select: options.select ?? (async () => undefined),
			notify: async () => {},
		},
	} as any;
	return {
		services,
		pi,
		ctx,
		runningSubagents,
		sentMessages,
		sentCommands,
		closedSurfaces,
		get surfaceCount() { return surfaceCount; },
	};
}

function writeProfile(
	harness: ReturnType<typeof createHarness>,
	root: string,
	sessionPath: string,
): void {
	writeLaunchProfile(
		sessionPath,
		harness.services.buildLaunchProfile({
			displayName: "Verifier",
			agentName: "verifier",
			roleBody: "Verify the saved work.",
			systemPromptMode: "append",
			cwd: root,
			agentDir: root,
			controls: {
				denyTools: [],
				autoExit: true,
				interactive: false,
				sessionMode: "standalone",
			},
			modelArgument: `${TEST_MODEL.provider}/${TEST_MODEL.id}:off`,
			originalSessionPath: sessionPath,
			resources: {
				tools: fingerprintStrings([]),
				visibleSkills: fingerprintStrings([]),
				updatedAt: "2026-09-02T00:00:00.000Z",
			},
		}),
	);
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 2_000;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	assert.fail("condition not met before timeout");
}

for (const systemPrompt of [undefined, "Keep the caller's constraints.\nReport validation results."]) {
	for (const rollover of [false, true]) {
		test(`bundled general-purpose ${systemPrompt ? "appends caller instructions" : "keeps its definition alone"} through ${rollover ? "rollover" : "resume"}`, async () => {
			await withTempDir(async (root) => {
				const definition = agentDefinitions.parseAgentDefinition(
					readFileSync(new URL("../agents/general-purpose.md", import.meta.url), "utf8"),
					"general-purpose",
				);
				assert.ok(definition?.body);
				assert.equal(definition.systemPromptMode, "append");
				const expectedRole = systemPrompt ? `${definition.body}\n\n${systemPrompt}` : definition.body;
				let definitionLoads = 0;
				const harness = createHarness(root, {
					loadAgentDefaults(name) {
						assert.equal(name, "general-purpose");
						assert.equal(++definitionLoads, 1, "resume must use the saved composition");
						return definition;
					},
					select: async () => "Start a fresh same-role session (recommended)",
				});
				const running = await harness.services.launchSubagent({
					name: "General purpose",
					agent: "general-purpose",
					task: "Inspect the checkout.",
					systemPrompt,
				}, harness.ctx);
				const launchCommand = harness.sentCommands[0].command;
				const promptPath = launchCommand.match(/--append-system-prompt '([^']+)'/)?.[1];
				assert.ok(promptPath);
				assert.equal(readFileSync(promptPath, "utf8"), expectedRole);
				const taskPath = launchCommand.match(/'@([^']+)'/)?.[1];
				assert.ok(taskPath);
				assert.equal(readFileSync(taskPath, "utf8"),
					"Complete your task autonomously.\n\nInspect the checkout.\n\nYour FINAL assistant message should summarize what you accomplished.");
				const saved = readLaunchProfile(running.sessionFile);
				assert.equal(saved.status, "ok");
				if (saved.status !== "ok") return;
				assert.equal(saved.profile.stable.roleBody, expectedRole);
				assert.equal(saved.profile.stable.roleBodyHash, hashText(expectedRole));
				assert.equal(saved.profile.stable.systemPromptMode, "append");
				harness.services.stopSubagent(running);

				writeSession(running.sessionFile, rollover ? 80 : 0);
				definition.body = "Changed definition must not replace the saved instructions.";
				const resumed = await harness.services.executeSubagentResume(harness.pi, {
					sessionPath: running.sessionFile,
					model: "previous",
					message: "Continue the inspection.",
				}, harness.ctx);
				assert.equal(resumed.details.status, "started");
				assert.equal(resumed.details.rollover, rollover ? "fresh" : undefined);
				await waitFor(() => harness.sentMessages.length === 1);
				assert.equal(harness.sentCommands.length, 2);
				const restoredPath = harness.sentCommands[1].command.match(/--append-system-prompt '([^']+)'/)?.[1];
				assert.ok(restoredPath);
				assert.equal(readFileSync(restoredPath, "utf8"), expectedRole);
				const sessionPath = rollover ? resumed.details.replacementSessionPath : running.sessionFile;
				assert.ok(typeof sessionPath === "string");
				const restored = readLaunchProfile(sessionPath);
				assert.equal(restored.status, "ok");
				if (restored.status !== "ok") return;
				assert.equal(restored.profile.stable.roleBody, expectedRole);
				assert.equal(restored.profile.stable.roleBodyHash, hashText(expectedRole));
				assert.equal(definitionLoads, 1);
			});
		});
	}
}

for (const systemPromptMode of ["replace", undefined] as const) {
	for (const [label, body, systemPrompt, expectedRole] of [
		["combined", "Definition instructions.", "Caller instructions.", "Definition instructions.\n\nCaller instructions."],
		["definition-only", "Definition instructions.", undefined, "Definition instructions."],
		["caller-only", undefined, "Caller instructions.", "Caller instructions."],
		["no role", undefined, undefined, ""],
	] as const) {
		test(`${systemPromptMode ?? "message"} launches deliver and persist ${label} instructions`, async () => {
			await withTempDir(async (root) => {
				const harness = createHarness(root, {
					loadAgentDefaults: () => ({ body, systemPromptMode, autoExit: true }),
				});
				const running = await harness.services.launchSubagent({
					name: "Worker", agent: "worker", task: "Work.", systemPrompt,
				}, harness.ctx);
				const command = harness.sentCommands[0].command;
				const taskPath = command.match(/'@([^']+)'/)?.[1];
				assert.ok(taskPath);
				const expectedTask = "Complete your task autonomously.\n\nWork.\n\nYour FINAL assistant message should summarize what you accomplished.";
				if (systemPromptMode && expectedRole) {
					const promptPath = command.match(/--system-prompt '([^']+)'/)?.[1];
					assert.ok(promptPath);
					assert.equal(readFileSync(promptPath, "utf8"), expectedRole);
					assert.equal(readFileSync(taskPath, "utf8"), expectedTask);
				} else {
					assert.doesNotMatch(command, /--(?:append-)?system-prompt/);
					assert.equal(readFileSync(taskPath, "utf8"),
						expectedRole ? `${expectedRole}\n\n${expectedTask}` : expectedTask);
				}
				const saved = readLaunchProfile(running.sessionFile);
				assert.equal(saved.status, "ok");
				if (saved.status !== "ok") return;
				assert.equal(saved.profile.stable.roleBody, expectedRole);
				assert.equal(saved.profile.stable.roleBodyHash, hashText(expectedRole));
				assert.equal(saved.profile.stable.systemPromptMode, systemPromptMode ?? "message");
				harness.services.stopSubagent(running);
			});
		});
	}
}

for (const systemPrompt of [undefined, "Keep the caller's constraints."]) {
	test(`Claude launches ${systemPrompt ? "append caller instructions" : "keep definition-only instructions"} consistently with the saved role`, async () => {
		await withTempDir(async (root) => {
			const body = "Follow the agent definition.";
			const expectedRole = systemPrompt ? `${body}\n\n${systemPrompt}` : body;
			const harness = createHarness(root, {
				loadAgentDefaults: () => ({ cli: "claude", body }),
			});
			const running = await harness.services.launchSubagent({
				name: "Claude", agent: "claude-code", task: "Work.", systemPrompt,
			}, harness.ctx);
			assert.ok(harness.sentCommands[0].command.includes(
				`--append-system-prompt ${shellEscape(expectedRole)}`,
			));
			const saved = readLaunchProfile(running.sessionFile);
			assert.equal(saved.status, "ok");
			if (saved.status !== "ok") return;
			assert.equal(saved.profile.stable.roleBody, expectedRole);
			assert.equal(saved.profile.stable.roleBodyHash, hashText(expectedRole));
			harness.services.stopSubagent(running);
		});
	});
}

for (const stage of ["session seed", "task artifact", "system prompt", "pi profile", "claude profile"] as const) {
	for (const callerOwned of [false, true]) {
		test(`launch ${stage} write failure ${callerOwned ? "preserves caller-owned" : "closes service-owned"} panes`, async () => {
			await withTempDir(async (root) => {
				const blockedPath = stage === "task artifact" || stage === "system prompt"
					? join(root, "artifacts", "parent", "context")
					: getDefaultSessionDirFor(root, root);
				const harness = createHarness(root, {
					loadAgentDefaults: () => ({
						cli: stage === "claude profile" ? "claude" : "pi",
						...(stage === "system prompt" ? {
							body: "Follow these instructions.",
							systemPromptMode: "append",
						} : {}),
					}),
					resolveLaunchBehavior: () => {
						// Sabotage a write destination after pane creation, not preflight.
						rmSync(blockedPath, { recursive: true, force: true });
						mkdirSync(dirname(blockedPath), { recursive: true });
						writeFileSync(blockedPath, "not a directory");
						return {
							sessionMode: stage === "session seed" ? "lineage-only" : "standalone",
							seededSessionMode: stage === "session seed" ? "lineage-only" : null,
							inheritsConversationContext: false,
							taskDelivery: "artifact",
						};
					},
				});

				await assert.rejects(harness.services.launchSubagent(
					{ name: "Worker", agent: "worker", task: "Work" },
					harness.ctx,
					callerOwned ? { surface: "%caller" } : undefined,
				), { code: "EEXIST", path: blockedPath });

				assert.equal(harness.surfaceCount, callerOwned ? 0 : 1);
				assert.deepEqual(harness.closedSurfaces, callerOwned ? [] : ["%1"]);
				assert.deepEqual(harness.sentCommands, []);
				assert.equal(harness.runningSubagents.size, 0);
				assert.equal(readFileSync(blockedPath, "utf8"), "not a directory");
			});
		});
	}
}

for (const cli of ["pi", "claude"]) {
	for (const callerOwned of [false, true]) {
		test(`${cli} command-delivery failure ${callerOwned ? "preserves caller-owned" : "closes service-owned"} panes`, async () => {
			await withTempDir(async (root) => {
				const failure = new Error("command delivery failed");
				let sessionPath: string | undefined;
				const harness = createHarness(root, {
					loadAgentDefaults: () => ({ cli }),
					sendLongCommand(surface) {
						assert.equal(surface, callerOwned ? "%caller" : "%1");
						const sessionDir = getDefaultSessionDirFor(root, root);
						// Both CLIs must remove the launch profile on delivery failure.
						const profiles = readdirSync(sessionDir).filter((name) => name.endsWith(".subagent.json"));
						assert.equal(profiles.length, 1);
						sessionPath = join(sessionDir, profiles[0].replace(/\.subagent\.json$/, ""));
						assert.equal(readLaunchProfile(sessionPath).status, "ok");
						throw failure;
					},
				});

				await assert.rejects(harness.services.launchSubagent(
					{ name: "Worker", agent: "worker", task: "Work" },
					harness.ctx,
					callerOwned ? { surface: "%caller" } : undefined,
				), (error) => error === failure);

				assert.equal(harness.surfaceCount, callerOwned ? 0 : 1);
				assert.deepEqual(harness.closedSurfaces, callerOwned ? [] : ["%1"]);
				assert.equal(harness.sentCommands.length, 1);
				assert.equal(harness.runningSubagents.size, 0);
				assert.ok(sessionPath);
				assert.equal(readLaunchProfile(sessionPath).status, "missing");
			});
		});
	}

	test(`${cli} successful launch keeps its pane open and registers the running child`, async () => {
		await withTempDir(async (root) => {
			const harness = createHarness(root, { loadAgentDefaults: () => ({ cli }) });
			const running = await harness.services.launchSubagent(
				{ name: "Worker", agent: "worker", task: "Work" }, harness.ctx,
			);

			assert.equal(harness.surfaceCount, 1);
			assert.deepEqual(harness.closedSurfaces, []);
			assert.equal(harness.sentCommands.length, 1);
			assert.equal(harness.runningSubagents.get(running.id), running);
			assert.equal(readLaunchProfile(running.sessionFile).status, "ok");
			harness.services.stopSubagent(running);
		});
	});
}

test("launch cleanup failure preserves the original setup error", async () => {
	await withTempDir(async (root) => {
		const failure = new Error("command delivery failed");
		const closeAttempts: string[] = [];
		const harness = createHarness(root, {
			sendLongCommand() { throw failure; },
			closeSurface(surface) {
				closeAttempts.push(surface);
				throw new Error("pane closure failed");
			},
		});

		await assert.rejects(harness.services.launchSubagent(
			{ name: "Worker", task: "Work" }, harness.ctx,
		), (error) => error === failure);

		assert.deepEqual(closeAttempts, ["%1"]);
		assert.equal(harness.runningSubagents.size, 0);
	});
});

test("launch validates the resolved profile cwd before creating a pane or writing a child", async () => {
	await withTempDir(async (root) => {
		const alternate = join(root, "alternate-checkout");
		const harness = createHarness(root, {
			loadAgentDefaults: () => ({ cwd: alternate, body: "Write" }),
			resolveSubagentPaths: (_params, defaults) => ({
				effectiveCwd: defaults?.cwd ?? null, localAgentDir: null, effectiveAgentDir: root,
			}),
		});
		let checked = false;
		await assert.rejects(harness.services.launchSubagent(
			{ name: "Writer", agent: "writer", task: "Write" }, harness.ctx,
			{ beforeLaunch(cwd) {
				checked = true;
				assert.equal(cwd, alternate);
				assert.equal(harness.surfaceCount, 0);
				throw new Error("Workflow execution repository mismatch");
			} },
		), /repository mismatch/);
		assert.equal(checked, true);
		assert.equal(harness.surfaceCount, 0);
		assert.deepEqual(harness.sentCommands, []);
		assert.equal(harness.runningSubagents.size, 0);
	});
});

test("guarded launch pins the fallback cwd in the command rather than inheriting tmux cwd", async () => {
	await withTempDir(async (root) => {
		const harness = createHarness(root, {
			resolveSubagentPaths: () => ({
				effectiveCwd: null, localAgentDir: null, effectiveAgentDir: root,
			}),
		});
		const checks: string[] = [];
		const running = await harness.services.launchSubagent(
			{ name: "Writer", task: "Write" }, harness.ctx,
			{ beforeLaunch(cwd) {
				assert.equal(harness.surfaceCount, 0);
				checks.push(cwd);
			} },
		);
		assert.deepEqual(checks, [root]);
		assert.ok(harness.sentCommands[0].command.startsWith(`cd '${root}' && `), harness.sentCommands[0].command);
		harness.services.stopSubagent(running);
	});
});

for (const rollover of [false, true]) {
	test(`${rollover ? "rollover" : "resume"} validates the saved execution cwd before creating a pane`, async () => {
		await withTempDir(async (root) => {
			const harness = createHarness(root, {
				select: async () => "Start a fresh same-role session (recommended)",
				resolveSubagentPaths: (params) => ({
					effectiveCwd: params.cwd ?? null, localAgentDir: null, effectiveAgentDir: root,
				}),
			});
			const alternate = join(root, "saved-checkout");
			const sessionPath = join(root, "saved-cwd.jsonl");
			writeSession(sessionPath, rollover ? 80 : 0);
			writeProfile(harness, alternate, sessionPath);
			const sessionBytes = readFileSync(sessionPath);
			const sidecarBytes = readFileSync(profilePathForSession(sessionPath));
			let checked = false;
			await assert.rejects(harness.services.executeSubagentResume(
				harness.pi, { sessionPath, model: "previous" }, harness.ctx, undefined,
				{ beforeLaunch(cwd, path) {
					checked = true;
					assert.equal(cwd, alternate);
					assert.equal(path, rollover ? undefined : sessionPath);
					assert.equal(harness.surfaceCount, 0);
					throw new Error("Workflow execution repository mismatch");
				} },
			), /repository mismatch/);
			assert.equal(checked, true);
			assert.equal(harness.surfaceCount, 0);
			assert.deepEqual(harness.sentCommands, []);
			assert.deepEqual(readFileSync(sessionPath), sessionBytes);
			assert.deepEqual(readFileSync(profilePathForSession(sessionPath)), sidecarBytes);
		});
	});
}

for (const names of [["Worker", "Worker"], ["Worker!", "Worker?"]]) {
	for (const systemPromptMode of ["append", "replace"] as const) {
		for (const phase of ["launch", "resume"] as const) {
			test(`${phase} isolates ${systemPromptMode} instruction artifacts for ${names.join(" / ")} in the same second`, async (t) => {
				t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-27T02:25:03.000Z") });
				await withTempDir(async (root) => {
					const harness = createHarness(root, {
						loadAgentDefaults: (agent) => ({
							body: `Role instructions for ${agent}.`,
							systemPromptMode,
							autoExit: true,
						}),
					});
					const tasks = ["Do the first task.", "Do the second task."];
					const roles = ["Role instructions for role-0.", "Role instructions for role-1."];
					const launched = await Promise.all(names.map((name, index) =>
						harness.services.launchSubagent({
							name,
							agent: `role-${index}`,
							task: tasks[index],
						}, harness.ctx),
					));
					let ids = launched.map((running) => running.id);
					let expectedTasks = tasks.map((task) =>
						`Complete your task autonomously.\n\n${task}\n\nYour FINAL assistant message should summarize what you accomplished.`,
					);
					if (phase === "resume") {
						for (const running of launched) writeSession(running.sessionFile);
						harness.sentCommands.length = 0;
						const resumed = await Promise.all(launched.map((running, index) =>
							harness.services.executeSubagentResume(harness.pi, {
								sessionPath: running.sessionFile,
								name: names[index],
								message: tasks[index],
								model: "previous",
							}, harness.ctx),
						));
						ids = resumed.map((result) => {
							assert.equal(result.details.status, "started");
							const id = result.details.id;
							assert.ok(typeof id === "string");
							return id;
						});
						expectedTasks = tasks;
						// Let immediate background watchers finish before removing fixtures.
						await new Promise((resolve) => setImmediate(resolve));
					}

					assert.equal(harness.sentCommands.length, 2);
					assert.notEqual(ids[0], ids[1]);
					const taskPaths: string[] = [];
					const systemPaths: string[] = [];
					const scriptPaths: string[] = [];
					// Read only after both launches have written files, as a delayed child would.
					for (const [index, { command, scriptPath }] of harness.sentCommands.entries()) {
						const taskPath = command.match(/'@([^']+)'/)?.[1];
						const systemFlag = systemPromptMode === "append" ? "--append-system-prompt" : "--system-prompt";
						const systemPath = command.match(new RegExp(`${systemFlag} '([^']+)'`))?.[1];
						assert.ok(taskPath);
						assert.ok(systemPath);
						assert.ok(scriptPath);
						assert.equal(readFileSync(taskPath, "utf8"), expectedTasks[index]);
						assert.equal(readFileSync(systemPath, "utf8"), roles[index]);
						for (const path of [taskPath, systemPath, scriptPath]) {
							assert.ok(path.includes(ids[index]), `artifact must include launch ID: ${path}`);
						}
						taskPaths.push(taskPath);
						systemPaths.push(systemPath);
						scriptPaths.push(scriptPath);
					}
					assert.equal(new Set([...taskPaths, ...systemPaths, ...scriptPaths]).size, 6);
				});
			});
		}
	}
}

test("fork launch inherits the live SessionManager branch after navigation without a new entry", async () => {
	await withTempDir(async (root) => {
		const harness = createHarness(root, {
			resolveLaunchBehavior: () => ({
				sessionMode: "fork",
				seededSessionMode: "fork",
				inheritsConversationContext: true,
				taskDelivery: "direct",
			}),
		});
		const parentFile = join(root, "parent.jsonl");
		writeSession(parentFile, 5);
		const manager = SessionManager.open(parentFile, root);
		manager.appendMessage({ role: "user", content: "Fork this request", timestamp: 3 });
		const selectedLeaf = manager.appendCustomEntry("launch", {});
		manager.branch("assistant-1");
		manager.appendMessage({ role: "user", content: "Abandoned request", timestamp: 4 });
		manager.appendCustomEntry("abandoned", {});
		manager.branch(selectedLeaf);
		harness.ctx.sessionManager = manager;
		const original = readFileSync(parentFile, "utf8");

		const running = await harness.services.launchSubagent(
			{ name: "Fork", task: "Do the assigned task", fork: true },
			harness.ctx,
		);
		const entries = readFileSync(running.sessionFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		assert.deepEqual(entries.slice(1).map((entry) => entry.id), ["user-1", "assistant-1"]);
		assert.equal(entries[0].parentSession, parentFile);
		assert.equal(readFileSync(parentFile, "utf8"), original);
	});
});

for (const failedCloses of [0, 1, 2]) {
	test(`ordinary watcher confirms closure only after a successful close (${failedCloses} failed attempts)`, async () => {
		await withTempDir(async (root) => {
			let attempts = 0;
			const harness = createHarness(root, {
				closeSurface: () => {
					if (++attempts <= failedCloses) throw new Error("tmux unavailable");
				},
			});
			const running = await harness.services.launchSubagent({ name: "Worker", task: "work" }, harness.ctx);
			writeSession(running.sessionFile);
			const sessionBytes = readFileSync(running.sessionFile, "utf8");
			const profileBytes = readFileSync(profilePathForSession(running.sessionFile), "utf8");
			const result = await harness.services.watchSubagent(running, new AbortController().signal);
			assert.equal(result.exitCode, failedCloses === 0 ? 0 : 1);
			assert.equal(running.surfaceClosed === true, failedCloses < 2);
			assert.equal(harness.runningSubagents.has(running.id), failedCloses === 2);
			if (failedCloses === 2) {
				harness.services.stopSubagent(running);
				assert.equal(attempts, 3);
				assert.equal(running.surfaceClosed, true);
				assert.equal(harness.runningSubagents.has(running.id), false);
			}
			assert.equal(readFileSync(running.sessionFile, "utf8"), sessionBytes);
			assert.equal(readFileSync(profilePathForSession(running.sessionFile), "utf8"), profileBytes);
		});
	});
}

test("workflow role completion preserves final result markers across a later done turn", async () => {
	await withTempDir(async (root) => {
		const harness = createHarness(root, {
			pollForExit: async () => ({ reason: "done", exitCode: 0 }),
		});
		for (const [roleId, final] of [
			["planner", "PLAN: /repo/.artifacts/work/PLAN.md"],
			["evaluator", "EVALUATION: /repo/.artifacts/work/EVALUATION.md"],
			["task-writer", "TASKS: /repo/.artifacts/work/TASKS.md"],
			["executor", "Completed T1. Validation: passed."],
			["reviewer", "REVIEW: /repo/.artifacts/work/REVIEW.md"],
		]) {
			const running = await harness.services.launchSubagent(
				{ name: roleId, task: "work" }, harness.ctx,
				{ workflow: {
					version: 1, workflowId: "peter", runId: "run", roleId,
					manifestHash: "a".repeat(64), skillHash: "b".repeat(64),
					policy: "per-role", assignmentSource: "parent", projectRoot: root, data: {},
				} },
			);
			writeFileSync(running.sessionFile, [
				{ type: "session", id: "session", version: 3, cwd: root },
				{ type: "message", id: "final", message: {
					role: "assistant", stopReason: "stop", content: [{ type: "text", text: final }],
				} },
				{ type: "message", id: "go", message: { role: "user", content: [{ type: "text", text: "go" }] } },
				{ type: "message", id: "done", message: {
					role: "assistant", stopReason: "toolUse",
					content: [{ type: "text", text: "Handing back to parent." }, { type: "toolCall", name: "subagent_done" }],
				} },
			].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
			const result = await harness.services.watchSubagent(running, new AbortController().signal);
			assert.equal(result.summary, `${final}\n\nCompletion note: Handing back to parent.`);
		}
	});
});

test("resumed workflow completion uses the current run's final answer", async () => {
	await withTempDir(async (root) => {
		const exit = deferred<{ reason: "done"; exitCode: number }>();
		const harness = createHarness(root, { pollForExit: () => exit.promise });
		const sessionPath = join(root, "planner.jsonl");
		writeSession(sessionPath, 2);
		writeProfile(harness, root, sessionPath);
		const workflow = {
			version: 1 as const, workflowId: "peter", runId: "run", roleId: "planner",
			manifestHash: "a".repeat(64), skillHash: "b".repeat(64),
			policy: "per-role" as const, assignmentSource: "parent" as const,
			projectRoot: root, data: {},
		};
		updateLaunchProfile(sessionPath, (profile) => ({ ...profile, workflow }));
		let summary: string | undefined;
		const started = await harness.services.executeSubagentResume(
			harness.pi, { sessionPath, name: "Planner", message: "Revise", model: "previous" },
			harness.ctx, undefined,
			{ workflowMetadata: workflow, onResult: ({ result }) => { summary = result.summary; } },
		);
		assert.equal(started.details.status, "started");
		writeFileSync(sessionPath, readFileSync(sessionPath, "utf8") + [
			{ type: "message", id: "new-final", message: {
				role: "assistant", stopReason: "stop",
				content: [{ type: "text", text: "PLAN: /repo/.artifacts/revised/PLAN.md" }],
			} },
			{ type: "message", id: "go", message: {
				role: "user", content: [{ type: "text", text: "go" }],
			} },
			{ type: "message", id: "done", message: {
				role: "assistant", stopReason: "toolUse",
				content: [{ type: "text", text: "Revision complete." }, { type: "toolCall", name: "subagent_done" }],
			} },
		].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
		exit.resolve({ reason: "done", exitCode: 0 });
		await waitFor(() => summary !== undefined);
		assert.equal(summary, "PLAN: /repo/.artifacts/revised/PLAN.md\n\nCompletion note: Revision complete.");
	});
});

test("same-session resume classifies quota failures in the asynchronous result", async () => {
	await withTempDir(async (root) => {
		const failure = "You exceeded your current quota; check billing and purchase more credits";
		const harness = createHarness(root, {
			pollForExit: async () => ({
				exitCode: 1,
				reason: "error",
				errorMessage: failure,
			}),
		});
		const sessionPath = join(root, "resume.jsonl");
		writeSession(sessionPath);
		writeProfile(harness, root, sessionPath);

		const result = await harness.services.executeSubagentResume(
			harness.pi,
			{ sessionPath, name: "Verifier", model: "previous" },
			harness.ctx,
		);
		assert.equal(result.details.status, "started");
		await waitFor(() => harness.sentMessages.length === 1);
		assert.equal(harness.sentMessages[0].details.errorMessage, failure);
		assert.equal(harness.sentMessages[0].details.failureKind, "usage");
	});
});

test("fresh rollover classifies exhausted retries in the asynchronous result", async () => {
	await withTempDir(async (root) => {
		const failure = "Provider overloaded after normal retries were exhausted (529)";
		const harness = createHarness(root, {
			pollForExit: async () => ({
				exitCode: 1,
				reason: "error",
				errorMessage: failure,
			}),
			select: async (_title, choices) => {
				const fresh = "Start a fresh same-role session (recommended)";
				assert.ok(choices.includes(fresh));
				return fresh;
			},
		});
		const sessionPath = join(root, "rollover.jsonl");
		writeSession(sessionPath, 80);
		writeProfile(harness, root, sessionPath);

		const result = await harness.services.executeSubagentResume(
			harness.pi,
			{ sessionPath, name: "Verifier", model: "previous" },
			harness.ctx,
		);
		assert.equal(result.details.rollover, "fresh");
		await waitFor(() => harness.sentMessages.length === 1);
		assert.equal(harness.sentMessages[0].details.errorMessage, failure);
		assert.equal(harness.sentMessages[0].details.failureKind, "retry-exhausted");
		assert.equal(harness.sentMessages[0].details.rollover, "fresh");
	});
});

test("recovery resume preserves recovery details and classifies provider failures", async () => {
	await withTempDir(async (root) => {
		const failure = "Connection reset after retries were exhausted";
		const harness = createHarness(root, {
			pollForExit: async () => ({
				exitCode: 1,
				reason: "error",
				errorMessage: failure,
			}),
		});
		const sessionPath = join(root, "recovery.jsonl");
		writeSession(sessionPath);
		writeProfile(harness, root, sessionPath);

		const result = await harness.services.executeSubagentResume(
			harness.pi,
			{ sessionPath, name: "Verifier", model: "previous" },
			harness.ctx,
			{
				failure: buildProviderFailureRecord({
					kind: "usage",
					message: "Original quota failure",
				}),
				details: {
					recovery: {
						workflowId: "docs-review",
						runId: "run-docs",
						roleId: "verifier",
					},
				},
			},
		);
		assert.equal(result.details.status, "started");
		await waitFor(() => harness.sentMessages.length === 1);
		assert.deepEqual(harness.sentMessages[0].details.recovery, {
			workflowId: "docs-review",
			runId: "run-docs",
			roleId: "verifier",
		});
		assert.equal(harness.sentMessages[0].details.failureKind, "retry-exhausted");
	});
});

for (const scenario of [
	"picked model",
	"previous model without default",
	"explicit model",
	"picker denied",
	"rollover denied",
	"missing forward lineage",
	"missing backward lineage",
	"stale default",
	"changed role",
	"recovery promotion",
	"recovery picker",
] as const) {
	test(`event-backed rollover confirms selected model metadata: ${scenario}`, { timeout: 5_000 }, async () => {
		await withTempDir(async (root) => {
			const exit = deferred<{ exitCode: number }>();
			const picked = scenario !== "previous model without default" && scenario !== "explicit model";
			let gates = 0;
			const harness = createHarness(root, {
				pollForExit: () => exit.promise,
				select: async (title, choices) => {
					let choice: string | undefined;
					if (title.startsWith("Saved context:")) {
						choice = picked && gates++ === 0
							? "Choose another model"
							: "Start a fresh same-role session (recommended)";
					} else if (title.startsWith("Thinking for ")) {
						choice = "off";
					} else {
						choice = choices.find((item) => item.startsWith(`${TEST_MODEL.provider}/next `));
					}
					assert.ok(choice && choices.includes(choice), `unexpected picker: ${title}`);
					return choice;
				},
			});
			harness.ctx.modelRegistry.getAvailable = () => [TEST_MODEL, { ...TEST_MODEL, id: "next", name: "Next" }];
			const sessionPath = join(root, "event-rollover.jsonl");
			writeSession(sessionPath, 80);
			writeProfile(harness, root, sessionPath);
			const io = tmuxWorkflowProviderIO();
			const originalModel = io.readProfile(sessionPath)!.runtime.lastModel!;
			const selection = scenario === "previous model without default"
				? originalModel : { ...originalModel, model: "next" };
			const owner = { sessionId: "parent", runId: "run", roleId: "verifier", ownershipId: "lease" };
			const workflow = {
				version: 1 as const, workflowId: "test", runId: owner.runId, roleId: owner.roleId,
				manifestHash: "a".repeat(64), skillHash: "b".repeat(64),
				policy: "per-role" as const, assignmentSource: "parent" as const, projectRoot: root,
				data: { handoff: "Keep the manifest handoff." },
				...(scenario !== "previous model without default" ? { currentDefault: originalModel } : {}),
			};
			updateLaunchProfile(sessionPath, (profile) => ({ ...profile, workflow }));
			const saved = io.readProfile(sessionPath)!;
			const agent = { agentId: "verifier", path: join(root, "verifier.md"),
				hash: "c".repeat(64), roleBodyHash: saved.stable.roleBodyHash };
			const emitter = new EventEmitter();
			const events = {
				on(channel: string, handler: (value: unknown) => void) {
					emitter.on(channel, handler);
					return () => { emitter.off(channel, handler); };
				},
				emit(channel: string, value: unknown) { emitter.emit(channel, value); },
			};
			let replacementPath: string | undefined;
			const attached = attachTmuxWorkflowProvider({
				...io, events, sessionId: owner.sessionId, isAvailable: () => true,
				resolveProfile: (id) => id === agent.agentId ? agent : null,
				checkRepository: (authorized, cwd) => {
					assert.equal(authorized, root);
					assert.equal(cwd, root);
					return root;
				},
				captureEvidence: () => ({ changedFiles: [] }), finishEvidence: () => ({ changedFiles: [] }),
				services: {
					...harness.services,
					async executeSubagentResume(...args) {
						const result = await harness.services.executeSubagentResume(...args);
						assert.equal(result.details.rollover, "fresh");
						replacementPath = result.details.replacementSessionPath as string;
						if (scenario === "missing forward lineage") {
							updateLaunchProfile(sessionPath, (profile) => ({ ...profile, lineage: {} }));
						} else if (scenario === "missing backward lineage") {
							updateLaunchProfile(replacementPath, (profile) => ({ ...profile, lineage: {} }));
						} else if (scenario === "stale default" || scenario === "changed role" || scenario === "recovery promotion") {
							updateLaunchProfile(replacementPath, (profile) => ({
								...profile,
								workflow: {
									...profile.workflow!,
									...(scenario === "stale default" ? { currentDefault: originalModel } : {}),
									...(scenario === "changed role" ? { roleId: "writer" } : {}),
									...(scenario === "recovery promotion" ? { assignmentSource: "recovery" as const } : {}),
								},
							}));
						}
						return result;
					},
				},
				ctx: harness.ctx, pi: harness.pi,
			});
			assert.ok(attached);
			try {
				const result = requestWorkflowProvider(events, attached.identity,
					scenario === "recovery picker" ? "recover" : "resume", owner, {
						sessionPath, expected: { agentId: agent.agentId, profileHash: agent.hash, model: originalModel },
						workflow, repositoryRoot: root,
						allowRollover: scenario !== "rollover denied",
						allowUserModelSelection: scenario !== "picker denied",
						...(scenario === "explicit model" ? { model: selection } : {}),
						...(scenario === "recovery picker" ? { model: originalModel, failure: "credits exhausted" } : {}),
					});
				const error = scenario === "picker denied" ? /model.*mismatch/i
					: scenario === "rollover denied" || scenario.includes("lineage") ? /rollover lineage/i
					: ["stale default", "changed role", "recovery promotion"].includes(scenario) ? /identity mismatch/i
					: undefined;
				if (error) {
					await assert.rejects(result, error);
					assert.deepEqual(harness.closedSurfaces, ["%1"], "an unconfirmed rollover must be stopped");
					assert.equal(harness.runningSubagents.size, 0);
					if (scenario === "stale default") {
						assert.deepEqual(io.readProfile(replacementPath!)?.workflow?.currentDefault, originalModel,
							"confirmation must not repair unconfirmed ordinary rollover metadata");
					}
				} else {
					const { data } = await result;
					assert.ok(replacementPath && replacementPath !== sessionPath);
					assert.equal(data.sessionPath, replacementPath);
					assert.equal(data.originalSessionPath, sessionPath);
					assert.equal(data.replacement, true);
					assert.equal(data.userSelectedModel, picked ? true : undefined);
					assert.equal(data.metadataConfirmed, true);
					assert.deepEqual(data.model, selection);
					assert.deepEqual(data.context, { tokens: 0, source: "new-session" });
					assert.deepEqual(io.readProfile(replacementPath)?.workflow, {
						...workflow, currentDefault: selection,
						...(scenario === "recovery picker" ? { assignmentSource: "recovery" } : {}),
					});
					assert.deepEqual(io.readProfile(replacementPath)?.runtime.lastModel, selection);
					assert.equal(io.readProfile(replacementPath)?.runtime.previousFailure, undefined);
					assert.equal(io.readProfile(replacementPath)?.stable.agentName, saved.stable.agentName);
					assert.equal(io.readProfile(replacementPath)?.stable.roleBodyHash, saved.stable.roleBodyHash);
					assert.equal(io.readProfile(replacementPath)?.lineage?.rolledOverFrom, sessionPath);
					assert.equal(io.readProfile(sessionPath)?.lineage?.rolledOverTo, replacementPath);
					assert.deepEqual(io.readProfile(sessionPath)?.workflow, workflow);
					assert.deepEqual(io.readProfile(sessionPath)?.runtime, saved.runtime);
					assert.deepEqual(harness.closedSurfaces, [], "a confirmed rollover must stay running");
					assert.equal(harness.runningSubagents.size, 1);
				}
				assert.equal(harness.surfaceCount, 1);
			} finally {
				attached.detach();
				exit.resolve({ exitCode: 0 });
				await new Promise((resolve) => setImmediate(resolve));
			}
		});
	});
}

for (const diagnostic of [
	{
		name: "secret-containing",
		message: "quota exhausted; Authorization: Bearer bearer-secret-value; api_key=api-secret-value; "
			+ "https://user:password@example.test?token=query-secret-value",
		kind: "usage",
		secrets: ["bearer-secret-value", "api-secret-value", "user:password", "query-secret-value"],
		oversized: false,
	},
	{
		name: "oversized",
		message: "diagnostic ".repeat(1_000) + "retries exhausted",
		kind: "retry-exhausted",
		secrets: [],
		oversized: true,
	},
	{
		name: "expanded redaction",
		message: "quota exhausted; " + "api_key=x; ".repeat(500),
		kind: "usage",
		secrets: ["api_key=x"],
		oversized: true,
	},
] as const) {
	test(`event-backed recovery persists only bounded, redacted ${diagnostic.name} diagnostics`, { timeout: 5_000 }, async () => {
		await withTempDir(async (root) => {
			const exit = deferred<{ exitCode: number }>();
			const harness = createHarness(root, { pollForExit: () => exit.promise });
			const sessionPath = join(root, "event-recovery.jsonl");
			writeSession(sessionPath);
			writeProfile(harness, root, sessionPath);
			const owner = { sessionId: "parent", runId: "run", roleId: "verifier", ownershipId: "lease" };
			const workflow = {
				version: 1 as const, workflowId: "test", runId: owner.runId, roleId: owner.roleId,
				manifestHash: "a".repeat(64), skillHash: "b".repeat(64),
				policy: "per-role" as const, assignmentSource: "recovery" as const, projectRoot: root, data: {},
			};
			updateLaunchProfile(sessionPath, (profile) => ({ ...profile, workflow }));
			const io = tmuxWorkflowProviderIO();
			const saved = io.readProfile(sessionPath)!;
			const selection = saved.runtime.lastModel!;
			const agent = { agentId: "verifier", path: join(root, "verifier.md"),
				hash: "c".repeat(64), roleBodyHash: saved.stable.roleBodyHash };
			const emitter = new EventEmitter();
			const events = {
				on(channel: string, handler: (value: unknown) => void) {
					emitter.on(channel, handler);
					return () => { emitter.off(channel, handler); };
				},
				emit(channel: string, value: unknown) { emitter.emit(channel, value); },
			};
			const attached = attachTmuxWorkflowProvider({
				...io, events, sessionId: owner.sessionId, isAvailable: () => true,
				resolveProfile: (id) => id === agent.agentId ? agent : null,
				checkRepository: (authorized, cwd) => {
					assert.equal(authorized, root);
					assert.equal(cwd, root);
					return root;
				},
				captureEvidence: () => ({ changedFiles: [] }), finishEvidence: () => ({ changedFiles: [] }),
				services: harness.services, ctx: harness.ctx, pi: harness.pi,
			});
			assert.ok(attached);
			let unsubscribe: (() => void) | undefined;
			try {
				const before = Date.now();
				const reply = await requestWorkflowProvider(events, attached.identity, "recover", owner, {
					sessionPath, expected: { agentId: agent.agentId, profileHash: agent.hash, model: selection },
					workflow, repositoryRoot: root, model: selection, failure: diagnostic.message,
				});
				assert.equal(reply.data.sessionPath, sessionPath);
				assert.equal(harness.surfaceCount, 1);
				assert.equal(io.readProfile(sessionPath)?.runtime.previousFailure, undefined,
					"launch acknowledgement alone must not persist recovery success");
				const delivered = deferred<void>();
				let successfulResponse = false;
				unsubscribe = subscribeWorkflowDelivery(events, attached.identity, owner, reply.requestId, (delivery) => {
					if (delivery.kind === "result") {
						successfulResponse = delivery.result.successfulResponse === true;
						delivered.resolve();
					}
				}, { sessionPath });
				writeSession(sessionPath, 10);
				exit.resolve({ exitCode: 0 });
				await delivered.promise;
				assert.equal(successfulResponse, true);

				const rawSidecar = readFileSync(profilePathForSession(sessionPath), "utf8");
				const failure = io.readProfile(sessionPath)?.runtime.previousFailure;
				assert.ok(failure, "a successful recovery must persist its diagnostic");
				assert.equal(failure.kind, diagnostic.kind, "classify the full message before truncation");
				assert.equal(failure.provider, selection.provider);
				assert.equal(failure.model, selection.model);
				assert.ok(Date.parse(failure.recordedAt) >= before && Date.parse(failure.recordedAt) <= Date.now());
				assert.ok(failure.message.length <= 2_000);
				if (diagnostic.oversized) assert.equal(failure.message.length, 2_000);
				if (diagnostic.secrets.length) assert.match(failure.message, /\[REDACTED\]/);
				for (const secret of diagnostic.secrets) {
					assert.ok(!rawSidecar.includes(secret), `sidecar must not contain ${secret}`);
				}
				assert.deepEqual(io.readProfile(sessionPath)?.stable, saved.stable);
				assert.deepEqual(io.readProfile(sessionPath)?.runtime.originalModel, saved.runtime.originalModel);
			} finally {
				unsubscribe?.();
				attached.detach();
				exit.resolve({ exitCode: 0 });
			}
		});
	});
}

for (const operation of ["resume", "recover"] as const) {
	for (const transition of ["stop", "failed stop", "rejected launch", "rejected cleanup", "detach", "wrong-owner stop"] as const) {
		test(`event-backed ${operation} callback ownership after ${transition}`, { timeout: 5_000 }, async () => {
			await withTempDir(async (root) => {
				const exit = deferred<{ exitCode: number }>();
				let stopFails = transition === "failed stop" || transition === "rejected cleanup";
				const harness = createHarness(root, {
					// A capture already queued can return success even after watcher abort.
					pollForExit: () => exit.promise,
					closeSurface: () => {
						if (stopFails) throw new Error("pane could not close");
					},
				});
				harness.ctx.modelRegistry.getAvailable = () => [TEST_MODEL, { ...TEST_MODEL, id: "next" }];
				const sessionPath = join(root, "stopped-resume.jsonl");
				writeSession(sessionPath);
				writeProfile(harness, root, sessionPath);
				const io = tmuxWorkflowProviderIO();
				const originalModel = io.readProfile(sessionPath)!.runtime.lastModel!;
				const selection = { ...originalModel, model: "next" };
				const owner = { sessionId: "parent", runId: "run", roleId: "verifier", ownershipId: "lease" };
				const workflow = {
					version: 1 as const, workflowId: "test", runId: owner.runId, roleId: owner.roleId,
					manifestHash: "a".repeat(64), skillHash: "b".repeat(64),
					policy: "per-role" as const, assignmentSource: "parent" as const, projectRoot: root, data: {},
					currentDefault: originalModel,
				};
				updateLaunchProfile(sessionPath, (profile) => ({ ...profile, workflow }));
				const saved = io.readProfile(sessionPath)!;
				const agent = { agentId: "verifier", path: join(root, "verifier.md"),
					hash: "c".repeat(64), roleBodyHash: saved.stable.roleBodyHash };
				const emitter = new EventEmitter();
				const events = {
					on(channel: string, handler: (value: unknown) => void) {
						emitter.on(channel, handler);
						return () => { emitter.off(channel, handler); };
					},
					emit(channel: string, value: unknown) { emitter.emit(channel, value); },
				};
				const rejected = transition === "rejected launch" || transition === "rejected cleanup";
				let lifecycle: Parameters<typeof harness.services.executeSubagentResume>[4];
				const attached = attachTmuxWorkflowProvider({
					...io, events, sessionId: owner.sessionId, isAvailable: () => true,
					resolveProfile: (id) => id === agent.agentId ? agent : null,
					checkRepository: (authorized, cwd) => {
						assert.equal(authorized, root);
						assert.equal(cwd, root);
						return root;
					},
					captureEvidence: () => ({ changedFiles: [] }), finishEvidence: () => ({ changedFiles: [] }),
					recordLaunchedModel: (path, model) => {
						if (rejected) throw new Error("model sidecar is read only");
						io.recordLaunchedModel(path, model);
					},
					services: {
						...harness.services,
						async executeSubagentResume(...args) {
							lifecycle = args[4];
							return harness.services.executeSubagentResume(...args);
						},
					},
					ctx: harness.ctx, pi: harness.pi,
				});
				assert.ok(attached);
				let unsubscribe: (() => void) | undefined;
				const delivered: unknown[] = [];
				try {
					const pending = requestWorkflowProvider(events, attached.identity, operation, owner, {
						sessionPath, expected: { agentId: agent.agentId, profileHash: agent.hash, model: originalModel },
						workflow, repositoryRoot: root, model: selection,
						...(operation === "recover" ? { failure: "credits exhausted" } : {}),
					});
					if (rejected) {
						await assert.rejects(pending, /model sidecar is read only/);
					} else {
						const reply = await pending;
						// Let the provider remove the acknowledged request from its pending map.
						await new Promise((resolve) => setImmediate(resolve));
						assert.equal(lifecycle?.isOwned?.(), true, "acknowledgement must leave callbacks owned");
						unsubscribe = subscribeWorkflowDelivery(events, attached.identity, owner, reply.requestId,
							(value) => delivered.push(value), { sessionPath });
						if (transition === "detach") attached.detach();
						else if (transition === "wrong-owner stop") {
							await assert.rejects(requestWorkflowProvider(events, attached.identity, "stop",
								{ ...owner, ownershipId: "stale" }, { sessionPath }), /owned.*not found/i);
						} else if (transition === "failed stop") {
							await assert.rejects(requestWorkflowProvider(events, attached.identity, "stop", owner,
								{ sessionPath }), /pane could not close/);
						} else {
							assert.deepEqual((await requestWorkflowProvider(events, attached.identity, "stop", owner,
								{ sessionPath })).data, { stopped: true });
						}
					}

					const sidecarBeforeCallback = readFileSync(profilePathForSession(sessionPath), "utf8");
					stopFails = false;
					writeSession(sessionPath, 10);
					exit.resolve({ exitCode: 0 });
					await new Promise((resolve) => setTimeout(resolve, 20));
					if (transition === "wrong-owner stop") {
						assert.equal(lifecycle?.isOwned?.(), true, "another owner cannot revoke callbacks");
						assert.equal(delivered.length, 1);
						assert.equal(io.readProfile(sessionPath)?.runtime.resumeCount, saved.runtime.resumeCount + 1);
						assert.deepEqual(io.readProfile(sessionPath)?.runtime.lastModel, selection);
					} else {
						assert.equal(readFileSync(profilePathForSession(sessionPath), "utf8"), sidecarBeforeCallback,
							"a queued success must not update model/default metadata after execution ownership is revoked");
						assert.equal(lifecycle?.isOwned?.(), false);
						assert.deepEqual(delivered, []);
					}
					assert.deepEqual(harness.sentMessages, []);
					if (transition === "failed stop" || transition === "rejected cleanup") {
						assert.deepEqual((await requestWorkflowProvider(events, attached.identity, "stop", owner,
							{ sessionPath })).data, { stopped: true }, "failed cleanup must retain ownership for a strict stop retry");
					}
				} finally {
					unsubscribe?.();
					stopFails = false;
					attached.detach();
					exit.resolve({ exitCode: 0 });
					await new Promise((resolve) => setImmediate(resolve));
				}
			});
		});
	}
}

test("a resumed workflow role cannot publish a late success or update its recovery sidecar after navigation", async () => {
	await withTempDir(async (root) => {
		const exit = deferred<{ exitCode: number }>();
		const harness = createHarness(root, { pollForExit: () => exit.promise });
		const sessionPath = join(root, "owned-resume.jsonl");
		writeSession(sessionPath);
		writeProfile(harness, root, sessionPath);
		let owned = true;
		const callbacks: string[] = [];
		await harness.services.executeSubagentResume(
			harness.pi, { sessionPath, model: "previous" }, harness.ctx,
			{
				failure: buildProviderFailureRecord({ kind: "usage", message: "quota" }),
				onSuccessfulResponse: () => { callbacks.push("recovery"); },
			},
			{
				isOwned: () => owned,
				onResult: () => { callbacks.push("result"); },
			},
		);
		const running = [...harness.runningSubagents.values()][0];
		owned = false;
		harness.services.stopSubagent(running);
		const profile = readLaunchProfile(sessionPath);
		// Simulate an already queued response winning the race with watcher abort.
		writeSession(sessionPath, 10);
		exit.resolve({ exitCode: 0 });
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(callbacks, []);
		assert.deepEqual(readLaunchProfile(sessionPath), profile);
		assert.deepEqual(harness.sentMessages, []);
	});
});

for (const transition of ["replacement", "shutdown", "session-id"] as const) {
	for (const outcome of ["success", "ping", "error"] as const) {
		test(`direct resume drops a pending capture's ${outcome} after ${transition}`, async () => {
			await withTempDir(async (root) => {
				const capture = deferred<void>();
				let moduleAbort = new AbortController();
				const harness = createHarness(root, {
					getModuleAbortSignal: () => moduleAbort.signal,
					pollForExit: async () => {
						// A capture already in flight can settle after its signal is aborted.
						await capture.promise;
						if (outcome === "error") throw new Error("capture failed");
						return {
							exitCode: 0,
							...(outcome === "ping" ? { ping: { name: "Verifier", message: "help" } } : {}),
						};
					},
				});
				const sessionPath = join(root, "pending-capture.jsonl");
				writeSession(sessionPath);
				writeProfile(harness, root, sessionPath);
				const profile = readLaunchProfile(sessionPath);
				const result = await harness.services.executeSubagentResume(
					harness.pi, { sessionPath, model: "previous" }, harness.ctx,
				);
				assert.equal(result.details.status, "started");
				assert.equal(harness.runningSubagents.size, 1);

				if (transition === "session-id") {
					harness.ctx.sessionManager.getSessionId = () => "replacement-parent";
				} else {
					moduleAbort.abort();
					if (transition === "replacement") moduleAbort = new AbortController();
				}
				// The replacement runtime accepts messages; it must never receive this result.
				writeSession(sessionPath, 10);
				capture.resolve();
				await new Promise((resolve) => setImmediate(resolve));
				assert.equal(harness.runningSubagents.size, 0);
				assert.deepEqual(harness.closedSurfaces, ["%1"]);
				assert.deepEqual(harness.sentMessages, []);
				assert.deepEqual(readLaunchProfile(sessionPath), profile);
			});
		});
	}
}

for (const outcome of ["success", "ping", "error"] as const) {
	test(`direct resume rechecks session ownership after an asynchronous ${outcome} callback`, async () => {
		await withTempDir(async (root) => {
			const entered = deferred<void>();
			const release = deferred<void>();
			let moduleAbort = new AbortController();
			const harness = createHarness(root, {
				getModuleAbortSignal: () => moduleAbort.signal,
				pollForExit: async () => ({
					exitCode: 0,
					...(outcome === "ping" ? { ping: { name: "Verifier", message: "help" } } : {}),
				}),
			});
			const sessionPath = join(root, "callback-replacement.jsonl");
			writeSession(sessionPath);
			writeProfile(harness, root, sessionPath);
			const pause = async () => {
				entered.resolve();
				await release.promise;
			};
			await harness.services.executeSubagentResume(
				harness.pi, { sessionPath, model: "previous" }, harness.ctx, undefined,
				{
					onResult: async () => {
						if (outcome === "error") throw new Error("result callback failed");
						await pause();
					},
					onError: async () => {
						await pause();
						throw new Error("error callback failed");
					},
				},
			);
			await entered.promise;
			moduleAbort.abort();
			moduleAbort = new AbortController();
			release.resolve();
			await new Promise((resolve) => setImmediate(resolve));
			assert.deepEqual(harness.sentMessages, []);
		});
	});

	test(`direct resume contains an invalidated API's ${outcome} delivery without retry or unhandled rejection`, async () => {
		await withTempDir(async (root) => {
			const capture = deferred<void>();
			const harness = createHarness(root, {
				pollForExit: async () => {
					await capture.promise;
					return {
						exitCode: 0,
						...(outcome === "ping" ? { ping: { name: "Verifier", message: "help" } } : {}),
					};
				},
			});
			const sessionPath = join(root, "invalid-runtime.jsonl");
			writeSession(sessionPath);
			writeProfile(harness, root, sessionPath);
			let attempts = 0;
			let errors = 0;
			harness.pi.sendMessage = () => {
				attempts++;
				throw new Error("Extension runtime is no longer active");
			};
			const unhandled: unknown[] = [];
			const onUnhandled = (error: unknown) => { unhandled.push(error); };
			process.on("unhandledRejection", onUnhandled);
			try {
				await harness.services.executeSubagentResume(
					harness.pi, { sessionPath, model: "previous" }, harness.ctx, undefined,
					{
						onResult: () => {
							if (outcome === "error") throw new Error("result callback failed");
						},
						onError: () => {
							errors++;
							throw new Error("error callback failed");
						},
					},
				);
				capture.resolve();
				await new Promise((resolve) => setImmediate(resolve));
				assert.deepEqual(unhandled, []);
				assert.equal(attempts, 1, "a failed send must not be retried through the invalid API");
				assert.equal(errors, outcome === "error" ? 1 : 0);
				assert.equal(harness.runningSubagents.size, 0);
			} finally {
				process.off("unhandledRejection", onUnhandled);
			}
		});
	});
}

test("a direct resume keeps its original session ownership across the context-fit gate", async () => {
	await withTempDir(async (root) => {
		const entered = deferred<void>();
		const release = deferred<string>();
		let moduleAbort = new AbortController();
		const harness = createHarness(root, {
			getModuleAbortSignal: () => moduleAbort.signal,
			select: async () => {
				entered.resolve();
				return release.promise;
			},
		});
		const sessionPath = join(root, "pending-direct-rollover.jsonl");
		writeSession(sessionPath, 80);
		writeProfile(harness, root, sessionPath);
		const pending = harness.services.executeSubagentResume(
			harness.pi, { sessionPath, model: "previous" }, harness.ctx,
		);
		const rejected = assert.rejects(pending, /session change or shutdown/);
		await entered.promise;
		moduleAbort.abort();
		moduleAbort = new AbortController();
		release.resolve("Start a fresh same-role session (recommended)");
		await rejected;
		assert.equal(harness.surfaceCount, 0);
		assert.deepEqual(harness.sentCommands, []);
		assert.deepEqual(harness.sentMessages, []);
	});
});

test("background watcher contains terminal ownership-check failures", async () => {
	await withTempDir(async (root) => {
		const harness = createHarness(root);
		const running = await harness.services.launchSubagent({ name: "Worker", task: "work" }, harness.ctx);
		const unhandled: unknown[] = [];
		const onUnhandled = (error: unknown) => { unhandled.push(error); };
		process.on("unhandledRejection", onUnhandled);
		try {
			harness.services.watchInBackground({
				pi: harness.pi, ctx: harness.ctx, running,
				isOwned: () => { throw new Error("runtime ownership is unavailable"); },
				onSuccess: () => ({ content: "success", details: {} }),
				onError: () => ({ content: "error", details: {} }),
			});
			await new Promise((resolve) => setImmediate(resolve));
			assert.deepEqual(unhandled, []);
			assert.deepEqual(harness.sentMessages, []);
			assert.equal(harness.runningSubagents.size, 0);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});
});

test("a pending workflow resume cannot launch after its context-fit gate loses branch ownership", async () => {
	await withTempDir(async (root) => {
		const entered = deferred<void>();
		const release = deferred<string>();
		const harness = createHarness(root, {
			select: async () => {
				entered.resolve();
				return release.promise;
			},
		});
		const sessionPath = join(root, "pending-rollover.jsonl");
		writeSession(sessionPath, 80);
		writeProfile(harness, root, sessionPath);
		let owned = true;
		let launched = false;
		const pending = harness.services.executeSubagentResume(
			harness.pi, { sessionPath, model: "previous" }, harness.ctx, undefined,
			{ isOwned: () => owned, onLaunched: () => { launched = true; } },
		);
		const outcome = pending.catch((error: Error) => error);
		await entered.promise;
		owned = false;
		release.resolve("Start a fresh same-role session (recommended)");
		assert.match(String(await outcome), /branch|navigation/i);
		assert.equal(launched, false);
		assert.equal(harness.runningSubagents.size, 0);
		assert.equal(harness.sentMessages.length, 0);
	});
});

test("a late workflow rollover is cleaned before it can publish lineage into saved sidecars", async () => {
	await withTempDir(async (root) => {
		const exit = deferred<{ exitCode: number }>();
		const harness = createHarness(root, {
			select: async () => "Start a fresh same-role session (recommended)",
			pollForExit: () => exit.promise,
		});
		const sessionPath = join(root, "late-rollover.jsonl");
		writeSession(sessionPath, 80);
		writeProfile(harness, root, sessionPath);
		const profile = readLaunchProfile(sessionPath);
		let owned = true;
		let child: any;
		try {
			await assert.rejects(harness.services.executeSubagentResume(
				harness.pi, { sessionPath, model: "previous" }, harness.ctx, undefined,
				{
					isOwned: () => owned,
					onLaunched: async ({ running }) => {
						child = running;
						// Navigation can begin while an asynchronous launch callback settles.
						owned = false;
					},
				},
			), /branch|navigation/i);
			assert.equal(child.abortController.signal.aborted, true);
			assert.ok(harness.closedSurfaces.includes(child.surface));
			assert.equal(harness.runningSubagents.size, 0);
			assert.deepEqual(readLaunchProfile(sessionPath), profile);
			assert.equal(readLaunchProfile(child.sessionFile).status, "ok", "keep the new role sidecar for explicit recovery");
		} finally {
			exit.resolve({ exitCode: 0 });
			await new Promise((resolve) => setImmediate(resolve));
		}
		assert.deepEqual(harness.sentMessages, []);
	});
});

for (const outcome of ["success", "ping", "error"] as const) {
	test(`workflow ${outcome} delivery rechecks ownership after an asynchronous callback`, async () => {
		await withTempDir(async (root) => {
			const entered = deferred<void>();
			const release = deferred<void>();
			const harness = createHarness(root, {
				pollForExit: async () => ({
					exitCode: 0,
					...(outcome === "ping" ? { ping: { name: "Worker", message: "help" } } : {}),
				}),
			});
			const running = await harness.services.launchSubagent({ name: "Worker", task: "work" }, harness.ctx);
			let owned = true;
			const pause = async () => {
				entered.resolve();
				await release.promise;
			};
			harness.services.watchInBackground({
				pi: harness.pi, ctx: harness.ctx, running, isOwned: () => owned,
				onPing: pause,
				onSuccess: async () => {
					if (outcome === "error") throw new Error("presentation failed");
					await pause();
					return { content: "late success", details: {} };
				},
				onError: async () => {
					await pause();
					// Also exercise the fallback error notification after rejection.
					throw new Error("late error");
				},
			});
			await entered.promise;
			owned = false;
			release.resolve();
			await new Promise((resolve) => setImmediate(resolve));
			assert.deepEqual(harness.sentMessages, []);
		});
	});
}

test("same-session persistence callback failure aborts and cleans the launched child", async () => {
	await withTempDir(async (root) => {
		let pollStarted = false;
		const harness = createHarness(root, {
			pollForExit: async (_surface, signal) => {
				pollStarted = true;
				await new Promise<void>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(new Error("poll aborted")),
						{ once: true },
					);
				});
				return { exitCode: 1 };
			},
		});
		const sessionPath = join(root, "callback-failure.jsonl");
		writeSession(sessionPath);
		writeProfile(harness, root, sessionPath);

		await assert.rejects(
			() =>
				harness.services.executeSubagentResume(
					harness.pi,
					{ sessionPath, name: "Verifier", model: "previous" },
					harness.ctx,
					undefined,
					{
						onLaunched() {
							throw new Error("workflow persistence failed");
						},
					},
				),
			/workflow persistence failed/,
		);
		assert.equal(pollStarted, true, "watcher must be installed before onLaunched");
		assert.equal(harness.runningSubagents.size, 0);
		assert.ok(harness.closedSurfaces.includes("%1"));
		await waitFor(() => harness.sentMessages.length === 1);
	});
});

test("fresh-rollover persistence callback failure aborts and cleans the replacement child", async () => {
	await withTempDir(async (root) => {
		let pollStarted = false;
		const harness = createHarness(root, {
			pollForExit: async (_surface, signal) => {
				pollStarted = true;
				await new Promise<void>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(new Error("poll aborted")),
						{ once: true },
					);
				});
				return { exitCode: 1 };
			},
			select: async () => "Start a fresh same-role session (recommended)",
		});
		const sessionPath = join(root, "rollover-callback-failure.jsonl");
		writeSession(sessionPath, 80);
		writeProfile(harness, root, sessionPath);

		await assert.rejects(
			() =>
				harness.services.executeSubagentResume(
					harness.pi,
					{ sessionPath, name: "Verifier", model: "previous" },
					harness.ctx,
					undefined,
					{
						onLaunched() {
							throw new Error("workflow persistence failed");
						},
					},
				),
			/workflow persistence failed/,
		);
		assert.equal(pollStarted, true, "replacement watcher must precede onLaunched");
		assert.equal(harness.runningSubagents.size, 0);
		assert.ok(harness.closedSurfaces.includes("%1"));
		await waitFor(() => harness.sentMessages.length === 1);
	});
});
