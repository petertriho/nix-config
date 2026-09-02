import assert from "node:assert/strict";
import {
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	fingerprintStrings,
	writeLaunchProfile,
} from "./launch-profile.ts";
import {
	createSubagentExecutionServices,
	type SubagentServiceDependencies,
} from "./subagent-services.ts";
import { buildProviderFailureRecord } from "./workflow/recovery.ts";

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
		select?: (title: string, choices: string[]) => Promise<string | undefined>;
	} = {},
) {
	const runningSubagents = new Map();
	const sentMessages: any[] = [];
	const closedSurfaces: string[] = [];
	let surfaceCount = 0;
	const moduleAbort = new AbortController();
	const deps: SubagentServiceDependencies = {
		subagentsDir: root,
		getAgentConfigDir: () => root,
		normalizeSubagentParams: (params) => params,
		loadAgentDefaults: () => null,
		resolveSubagentPaths: () => ({
			effectiveCwd: root,
			localAgentDir: null,
			effectiveAgentDir: root,
		}),
		resolveLaunchBehavior: () => ({
			sessionMode: "standalone",
			seededSessionMode: null,
			inheritsConversationContext: false,
			taskDelivery: "artifact",
		}),
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
		sendLongCommand() {},
		closeSurface: (surface) => {
			closedSurfaces.push(surface);
		},
		pollForExit: options.pollForExit
			?? (async () => ({ exitCode: 0 })),
		readScreen: () => "",
		getModuleAbortSignal: () => moduleAbort.signal,
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
		closedSurfaces,
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
