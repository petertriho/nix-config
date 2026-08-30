import assert from "node:assert/strict";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import piContextWindowCap, {
	CAP_COMMAND_NAME,
	CAP_CONFIG_FILENAME,
	ContextWindowCapController,
	capConfigIo,
	collectSessionModels,
	MODEL_CATALOG_REFRESHED_EVENT,
	parseCapCommandInput,
	parseCapConfig,
	readCapConfig,
	removeCapConfig,
	saveCapConfig,
	WARNING_PREFIX,
} from "./pi-context-window-cap.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WarningCapture = {
	prefixed: string[];
	all: string[];
};

function captureWarnings(run: () => void): WarningCapture {
	const prefixed: string[] = [];
	const all: string[] = [];
	const originalWarn = console.warn;
	console.warn = (...args: unknown[]) => {
		const text = args.map(String).join(" ");
		all.push(text);
		if (text.includes(WARNING_PREFIX)) prefixed.push(text);
	};
	try {
		run();
	} finally {
		console.warn = originalWarn;
	}
	return { prefixed, all };
}

function makeAgentDir(config?: string): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-context-window-cap-"));
	if (config !== undefined) {
		writeFileSync(join(dir, CAP_CONFIG_FILENAME), config, "utf-8");
	}
	return dir;
}

async function withAgentDir<T>(
	config: string | undefined,
	run: (dir: string) => T | Promise<T>,
): Promise<T> {
	const dir = makeAgentDir(config);
	process.env.PI_CODING_AGENT_DIR = dir;
	try {
		return await run(dir);
	} finally {
		delete process.env.PI_CODING_AGENT_DIR;
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Rewrite the config file inside the active PI_CODING_AGENT_DIR. */
function writeConfig(maxContextWindow: number): void {
	const dir = process.env.PI_CODING_AGENT_DIR;
	if (!dir) throw new Error("writeConfig requires an active withAgentDir context");
	writeFileSync(
		join(dir, CAP_CONFIG_FILENAME),
		JSON.stringify({ maxContextWindow }),
		"utf-8",
	);
}

function makeModel(contextWindow: number): { contextWindow: number } {
	return { contextWindow };
}

interface Harness {
	pi: ExtensionAPI;
	handlerNames: () => string[];
	fire: (event: string, eventPayload: unknown, ctx: unknown) => unknown[];
	emit: (channel: string, data: unknown) => unknown[];
	commandNames: () => string[];
	runCommand: (name: string, args: string) => Promise<CapturedNotification[]>;
}

interface CapturedNotification {
	message: string;
	severity?: "info" | "warning" | "error";
}

function createHarness(factory: (pi: ExtensionAPI) => void): Harness {
	const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
	const eventBusHandlers = new Map<string, Array<(data: unknown) => unknown>>();
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: unknown) => Promise<void> | void }
	>();
	const pi = {
		on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
			const registered = handlers.get(event) ?? [];
			registered.push(handler);
			handlers.set(event, registered);
		},
		registerCommand(
			name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> | void },
		) {
			commands.set(name, { handler: options.handler });
		},
		events: {
			on(channel: string, handler: (data: unknown) => unknown) {
				const registered = eventBusHandlers.get(channel) ?? [];
				registered.push(handler);
				eventBusHandlers.set(channel, registered);
				return () => {};
			},
			emit(channel: string, data: unknown) {
				for (const handler of eventBusHandlers.get(channel) ?? []) handler(data);
			},
		},
	} as unknown as ExtensionAPI;
	factory(pi);
	return {
		pi,
		handlerNames: () => [...handlers.keys()],
		fire: (event, eventPayload, ctx) =>
			(handlers.get(event) ?? []).map((handler) => handler(eventPayload, ctx)),
		emit: (channel, data) =>
			(eventBusHandlers.get(channel) ?? []).map((handler) => handler(data)),
		commandNames: () => [...commands.keys()],
		runCommand: async (name, args) => {
			const command = commands.get(name);
			if (!command) throw new Error(`command not registered: ${name}`);
			const notifications: CapturedNotification[] = [];
			// Minimal command context: only ui.notify exists, so any dialog or
			// other context use would fail loudly inside the test.
			const ctx = {
				ui: {
					notify: (message: string, severity?: "info" | "warning" | "error") => {
						notifications.push({ message, severity });
				},
				},
			};
			await command.handler(args, ctx);
			return notifications;
		},
	};
}

function sessionCtx(models: { contextWindow: number }[], extras: Partial<Record<string, unknown>> = {}) {
	return {
		modelRegistry: { getAll: () => models },
		model: models[0],
		scopedModels: models.map((model) => ({ model })),
		...extras,
	};
}

// ---------------------------------------------------------------------------
// T1: configuration parsing and loading
// ---------------------------------------------------------------------------

test("parseCapConfig accepts a valid config with extra fields", () => {
	const result = parseCapConfig(
		JSON.stringify({ maxContextWindow: 350000, note: "local cap", future: [1] }),
	);
	assert.deepEqual(result, { ok: true, maxContextWindow: 350000 });
});

test("readCapConfig returns missing for an absent file", () => {
	const dir = makeAgentDir();
	try {
		assert.equal(existsSync(join(dir, CAP_CONFIG_FILENAME)), false);
		assert.deepEqual(readCapConfig(dir), { status: "missing" });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("readCapConfig returns missing for a missing agent directory", () => {
	assert.deepEqual(readCapConfig(join(tmpdir(), "pi-context-window-cap-does-not-exist")), {
		status: "missing",
	});
});

test("readCapConfig rejects malformed JSON", () => {
	withAgentDir("{ not json", (dir) => {
		const result = readCapConfig(dir);
		assert.equal(result.status, "invalid");
	});
});

test("readCapConfig rejects invalid root shapes", () => {
	const roots = ["[]", '"350000"', "350000", "null", "true"];
	for (const root of roots) {
		withAgentDir(root, (dir) => {
			const result = readCapConfig(dir);
			assert.equal(result.status, "invalid", `root ${root} must be invalid`);
		});
	}
});

test("readCapConfig rejects a missing maxContextWindow field", () => {
	withAgentDir(JSON.stringify({ unrelated: true }), (dir) => {
		const result = readCapConfig(dir);
		assert.equal(result.status, "invalid");
	});
});

test("readCapConfig rejects invalid maxContextWindow values", () => {
	const values = [0, -1, 350000.5, 2 ** 53, "350000", 1e999];
	for (const value of values) {
		withAgentDir(JSON.stringify({ maxContextWindow: value }), (dir) => {
			const result = readCapConfig(dir);
			assert.equal(result.status, "invalid", `value ${value} must be invalid`);
		});
	}
});

test("factory with invalid config warns exactly once and disables clamping", () => {
	withAgentDir("{ not json", () => {
		const capture = captureWarnings(() => {
			const harness = createHarness(piContextWindowCap);
			const model = makeModel(1_000_000);
			harness.fire("session_start", { type: "session_start", reason: "startup" }, sessionCtx([model]));
			assert.equal(model.contextWindow, 1_000_000);
		});
		assert.equal(capture.prefixed.length, 1, "exactly one prefixed warning");
		assert.equal(capture.all.length, 1, "no other warnings");
	});
});

test("factory with a missing config stays silent and disables clamping", () => {
	withAgentDir(undefined, () => {
		const capture = captureWarnings(() => {
			const harness = createHarness(piContextWindowCap);
			const model = makeModel(1_000_000);
			harness.fire("session_start", { type: "session_start", reason: "startup" }, sessionCtx([model]));
			assert.equal(model.contextWindow, 1_000_000);
		});
		assert.equal(capture.all.length, 0, "missing config is silent");
	});
});

// ---------------------------------------------------------------------------
// Command input parsing
// ---------------------------------------------------------------------------

test("parser treats empty and whitespace-only input as the status action", () => {
	assert.deepEqual(parseCapCommandInput(""), { action: "status" });
	assert.deepEqual(parseCapCommandInput("   "), { action: "status" });
	assert.deepEqual(parseCapCommandInput(" \t\n "), { action: "status" });
});

test("parser recognizes off case-insensitively", () => {
	for (const input of ["off", "OFF", "Off", "oFf", " off ", "\toff\n"]) {
		assert.deepEqual(
			parseCapCommandInput(input),
			{ action: "off" },
			`input ${JSON.stringify(input)}`,
		);
	}
});

test("parser accepts plain positive integers", () => {
	assert.deepEqual(parseCapCommandInput("350000"), { action: "set", maxContextWindow: 350000 });
	assert.deepEqual(parseCapCommandInput(" 1 "), { action: "set", maxContextWindow: 1 });
	assert.deepEqual(parseCapCommandInput(String(Number.MAX_SAFE_INTEGER)), {
		action: "set",
		maxContextWindow: Number.MAX_SAFE_INTEGER,
	});
});

test("parser accepts k and m suffixes case-insensitively", () => {
	assert.deepEqual(parseCapCommandInput("350k"), { action: "set", maxContextWindow: 350000 });
	assert.deepEqual(parseCapCommandInput("350K"), { action: "set", maxContextWindow: 350000 });
	assert.deepEqual(parseCapCommandInput("1m"), { action: "set", maxContextWindow: 1_000_000 });
	assert.deepEqual(parseCapCommandInput("1M"), { action: "set", maxContextWindow: 1_000_000 });
	assert.deepEqual(parseCapCommandInput(" 2k "), { action: "set", maxContextWindow: 2000 });
});

test("parser accepts fractional mantissas that expand to whole tokens", () => {
	assert.deepEqual(parseCapCommandInput("1.5m"), { action: "set", maxContextWindow: 1_500_000 });
	assert.deepEqual(parseCapCommandInput("2.25k"), { action: "set", maxContextWindow: 2250 });
	assert.deepEqual(parseCapCommandInput("0.5k"), { action: "set", maxContextWindow: 500 });
	assert.deepEqual(parseCapCommandInput("0.1k"), { action: "set", maxContextWindow: 100 });
	assert.deepEqual(parseCapCommandInput("0.000001m"), { action: "set", maxContextWindow: 1 });
});

test("parser rejects zero and negative values", () => {
	for (const input of ["0", "00", "0k", "0.0m", "-1", "-350k", "-0"]) {
		assert.deepEqual(
			parseCapCommandInput(input).action,
			"invalid",
			`input ${JSON.stringify(input)} must be invalid`,
		);
	}
});

test("parser rejects values above the maximum safe integer", () => {
	assert.deepEqual(parseCapCommandInput("9007199254740992").action, "invalid");
	assert.deepEqual(parseCapCommandInput("9007199254741k").action, "invalid");
	assert.deepEqual(parseCapCommandInput("10000000000000m").action, "invalid");
});

test("parser rejects bare fractions and fractionally expanding suffixes", () => {
	for (const input of [
		"350000.5",
		"1.5",
		"0.5",
		"350.",
		".5",
		".5k",
		"1.0005k",
		"0.0001k",
		"1.0000001m",
	]) {
		assert.deepEqual(
			parseCapCommandInput(input).action,
			"invalid",
			`input ${JSON.stringify(input)} must be invalid`,
		);
	}
});

test("parser rejects malformed values, unknown suffixes, and separators", () => {
	for (const input of [
		"abc",
		"k",
		"m",
		"350kb",
		"350g",
		"350mi",
		"350_000",
		"350,000",
		"+350",
		"3.5.5k",
		"1e6",
		"1E6",
		"0x10",
	]) {
		assert.deepEqual(
			parseCapCommandInput(input).action,
			"invalid",
			`input ${JSON.stringify(input)} must be invalid`,
		);
	}
});

test("parser rejects multiple arguments and trailing text", () => {
	for (const input of ["350000 100000", "350k extra", "off now", "  1  2  "]) {
		assert.deepEqual(
			parseCapCommandInput(input).action,
			"invalid",
			`input ${JSON.stringify(input)} must be invalid`,
		);
	}
});

test("parser reports a non-empty reason for invalid input", () => {
	const result = parseCapCommandInput("nope");
	assert.equal(result.action, "invalid");
	if (result.action === "invalid") {
		assert.equal(typeof result.reason, "string");
		assert.ok(result.reason.length > 0);
	}
});

test("command name matches the config terminology without a slash", () => {
	assert.equal(CAP_COMMAND_NAME, "context-window-cap");
});

// ---------------------------------------------------------------------------
// Config persistence helpers
// ---------------------------------------------------------------------------

function withTempAgentDir(config: string | undefined, run: (dir: string) => void): void {
	const dir = makeAgentDir(config);
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function configPathOf(dir: string): string {
	return join(dir, CAP_CONFIG_FILENAME);
}

function readConfigText(dir: string): string {
	return readFileSync(configPathOf(dir), "utf-8");
}

/** Directory entries, to prove atomic replacement leaves no temp files. */
function directoryEntries(dir: string): string[] {
	return readdirSync(dir).sort();
}

test("saveCapConfig creates canonical indented JSON with a trailing newline", () => {
	withTempAgentDir(undefined, (dir) => {
		saveCapConfig(dir, 350000);
		assert.equal(readConfigText(dir), '{\n\t"maxContextWindow": 350000\n}\n');
		assert.deepEqual(readCapConfig(dir), { status: "valid", maxContextWindow: 350000 });
	});
});

test("saveCapConfig serializes suffixed expansions as canonical integers", () => {
	withTempAgentDir(undefined, (dir) => {
		saveCapConfig(dir, 350_000);
		saveCapConfig(dir, 1_500_000);
		assert.equal(readConfigText(dir), '{\n\t"maxContextWindow": 1500000\n}\n');
	});
});

test("saveCapConfig preserves unknown keys of a readable object", () => {
	const original = JSON.stringify({ note: "local cap", future: [1], maxContextWindow: 1 });
	withTempAgentDir(original, (dir) => {
		saveCapConfig(dir, 350000);
		assert.deepEqual(JSON.parse(readConfigText(dir)), {
			note: "local cap",
			future: [1],
			maxContextWindow: 350000,
		});
	});
});

test("saveCapConfig repairs malformed readable JSON", () => {
	withTempAgentDir("{ not json", (dir) => {
		saveCapConfig(dir, 350000);
		assert.deepEqual(readCapConfig(dir), { status: "valid", maxContextWindow: 350000 });
	});
});

test("saveCapConfig repairs array, scalar, and null roots", () => {
	for (const root of ["[]", '"350000"', "350000", "null", "true"]) {
		withTempAgentDir(root, (dir) => {
			saveCapConfig(dir, 350000);
			assert.deepEqual(
				readCapConfig(dir),
				{ status: "valid", maxContextWindow: 350000 },
				`root ${root} must be repaired`,
			);
		});
	}
});

test("saveCapConfig propagates non-ENOENT read errors", () => {
	withTempAgentDir(JSON.stringify({ maxContextWindow: 350000 }), (dir) => {
		chmodSync(configPathOf(dir), 0o000);
		try {
			assert.throws(() => saveCapConfig(dir, 900000), (error: unknown) =>
				(error as { code?: unknown }).code === "EACCES");
		} finally {
			chmodSync(configPathOf(dir), 0o600);
		}
	});
});

test("saveCapConfig replaces the file atomically and leaves no temporary files", () => {
	withTempAgentDir(JSON.stringify({ maxContextWindow: 1 }), (dir) => {
		saveCapConfig(dir, 350000);
		saveCapConfig(dir, 1_500_000);
		assert.deepEqual(directoryEntries(dir), [CAP_CONFIG_FILENAME]);
	});
});

test("saveCapConfig cleans up the temporary file when the write fails", () => {
	const original = JSON.stringify({ maxContextWindow: 350000, note: "keep" });
	withTempAgentDir(original, (dir) => {
		chmodSync(dir, 0o500);
		try {
			assert.throws(() => saveCapConfig(dir, 900000), (error: unknown) =>
				(error as { code?: unknown }).code === "EACCES");
		} finally {
			chmodSync(dir, 0o700);
		}
		assert.equal(readConfigText(dir), original, "original bytes must be unchanged");
		assert.deepEqual(directoryEntries(dir), [CAP_CONFIG_FILENAME]);
	});
});

test("removeCapConfig deletes an existing file", () => {
	withTempAgentDir(JSON.stringify({ maxContextWindow: 350000 }), (dir) => {
		removeCapConfig(dir);
		assert.equal(existsSync(configPathOf(dir)), false);
		assert.deepEqual(readCapConfig(dir), { status: "missing" });
	});
});

test("removeCapConfig succeeds when the file is already missing", () => {
	withTempAgentDir(undefined, (dir) => {
		removeCapConfig(dir);
		removeCapConfig(dir);
		assert.equal(existsSync(configPathOf(dir)), false);
	});
});

test("removeCapConfig propagates non-missing filesystem errors", () => {
	withTempAgentDir(undefined, (dir) => {
		mkdirSync(configPathOf(dir));
		try {
			assert.throws(() => removeCapConfig(dir));
		} finally {
			rmSync(configPathOf(dir), { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// T2: clamping controller
// ---------------------------------------------------------------------------

test("controller keeps a below-cap model unchanged", () => {
	const controller = new ContextWindowCapController(350000);
	const model = makeModel(200000);
	controller.apply(model);
	assert.equal(model.contextWindow, 200000);
});

test("controller keeps an exactly-at-cap model unchanged", () => {
	const controller = new ContextWindowCapController(350000);
	const model = makeModel(350000);
	controller.apply(model);
	assert.equal(model.contextWindow, 350000);
});

test("controller clamps an above-cap model", () => {
	const controller = new ContextWindowCapController(350000);
	const model = makeModel(1_000_000);
	controller.apply(model);
	assert.equal(model.contextWindow, 350000);
});

test("repeated application is idempotent", () => {
	const controller = new ContextWindowCapController(350000);
	const model = makeModel(1_000_000);
	for (let i = 0; i < 5; i += 1) {
		controller.apply(model);
		assert.equal(model.contextWindow, 350000);
	}
	assert.equal(controller.trackedCount(), 1);
});

test("application only changes contextWindow, never other metadata", () => {
	const controller = new ContextWindowCapController(350000);
	const model = {
		id: "big-model",
		name: "Big Model",
		provider: "example",
		contextWindow: 1_000_000,
		maxTokens: 8192,
		cost: { input: 1, output: 2 },
		reasoning: true,
	};
	const before = { ...model };
	controller.apply(model);
	assert.equal(model.contextWindow, 350000);
	for (const [key, value] of Object.entries(before)) {
		if (key === "contextWindow") continue;
		assert.deepEqual((model as Record<string, unknown>)[key], value, `${key} must be untouched`);
	}
	assert.deepEqual(Object.keys(model), Object.keys(before));
});

test("models with non-finite or non-positive windows are ignored", () => {
	const controller = new ContextWindowCapController(350000);
	for (const raw of [0, -5, Number.POSITIVE_INFINITY, Number.NaN]) {
		const model = makeModel(raw);
		controller.apply(model);
		assert.equal(model.contextWindow, raw, `source ${raw} must be left alone`);
	}
	assert.equal(controller.trackedCount(), 0);
});

test("a new model object from a later refresh is clamped independently", () => {
	const controller = new ContextWindowCapController(350000);
	const first = makeModel(1_000_000);
	controller.apply(first);
	assert.equal(first.contextWindow, 350000);

	// Provider refresh replaces the catalog object.
	const replacement = makeModel(900000);
	controller.applyAll([replacement]);
	assert.equal(replacement.contextWindow, 350000);
	assert.equal(first.contextWindow, 350000);
	assert.equal(controller.trackedCount(), 2);
});

test("an upstream change to a tracked model refreshes the original before reclamping", () => {
	const controller = new ContextWindowCapController(350000);
	const model = makeModel(1_000_000);
	controller.apply(model);
	assert.equal(model.contextWindow, 350000);

	// Upstream raises the same object to 900000.
	model.contextWindow = 900000;
	controller.apply(model);
	assert.equal(model.contextWindow, 350000);

	// Restoration returns to the refreshed upstream value, not the stale 1M.
	controller.restore();
	assert.equal(model.contextWindow, 900000);
});

test("guarded restoration preserves a later third-party mutation", () => {
	const controller = new ContextWindowCapController(350000);
	const model = makeModel(1_000_000);
	controller.apply(model);
	assert.equal(model.contextWindow, 350000);

	// A third party changes the value after this extension applied its cap.
	model.contextWindow = 400000;
	controller.restore();
	assert.equal(model.contextWindow, 400000);
	assert.equal(controller.trackedCount(), 0);
});

test("restoration followed by a higher cap uses the higher cap", () => {
	const first = new ContextWindowCapController(350000);
	const model = makeModel(1_000_000);
	first.apply(model);
	assert.equal(model.contextWindow, 350000);
	first.restore();
	assert.equal(model.contextWindow, 1_000_000);

	const second = new ContextWindowCapController(900000);
	second.apply(model);
	assert.equal(model.contextWindow, 900000);
});

test("restoration is a no-op on an empty controller", () => {
	const controller = new ContextWindowCapController(350000);
	controller.restore();
	assert.equal(controller.trackedCount(), 0);
});

test("applyAll deduplicates by object identity", () => {
	const controller = new ContextWindowCapController(350000);
	const shared = makeModel(1_000_000);
	const other = makeModel(1_000_000);
	controller.applyAll([shared, other, shared, other, other]);
	assert.equal(shared.contextWindow, 350000);
	assert.equal(other.contextWindow, 350000);
	assert.equal(controller.trackedCount(), 2);
});

test("collectSessionModels deduplicates registry, active, scoped, and selected models", () => {
	const registryModel = makeModel(1_000_000);
	const activeModel = makeModel(2_000_000);
	const scopedModel = makeModel(3_000_000);
	const selectedModel = makeModel(4_000_000);
	const ctx = {
		modelRegistry: { getAll: () => [registryModel, activeModel] },
		model: activeModel,
		scopedModels: [{ model: activeModel }, { model: scopedModel }],
	};
	const collected = collectSessionModels(ctx, selectedModel);
	assert.equal(collected.length, 4);
	assert.ok(collected.includes(registryModel));
	assert.ok(collected.includes(activeModel));
	assert.ok(collected.includes(scopedModel));
	assert.ok(collected.includes(selectedModel));
});

test("collectSessionModels tolerates absent models and empty registries", () => {
	assert.deepEqual(collectSessionModels({}), []);
	assert.deepEqual(collectSessionModels({ modelRegistry: { getAll: () => [] } }), []);
	assert.deepEqual(collectSessionModels({ modelRegistry: { getAll: () => [] }, model: undefined }), []);
	const lone = makeModel(100);
	assert.deepEqual(collectSessionModels({ scopedModels: [{ model: lone }] }), [lone]);
});

// ---------------------------------------------------------------------------
// T3: Pi session lifecycle enforcement
// ---------------------------------------------------------------------------

const ENFORCEMENT_EVENTS = [
	"session_start",
	"input",
	"context",
	"model_select",
	"session_before_compact",
	"session_before_tree",
	"session_shutdown",
] as const;

const COMPACT_EVENT = {
	type: "session_before_compact",
	preparation: {},
	branchEntries: [],
	reason: "threshold",
	willRetry: false,
	signal: undefined,
};

const TREE_EVENT = {
	type: "session_before_tree",
	preparation: { targetId: "t", oldLeafId: null, commonAncestorId: null, entriesToSummarize: [], userWantsSummary: true },
	signal: undefined,
};

function fireEnforcementEvent(
	harness: Harness,
	event: string,
	ctx: unknown,
	eventPayload?: unknown,
): unknown[] {
	const payload =
		eventPayload ??
		(event === "input"
			? { type: "input", text: "hello", source: "interactive" }
			: event === "context"
				? { type: "context", messages: [] }
				: event === "model_select"
					? { type: "model_select", model: makeModel(1), previousModel: undefined, source: "set" }
					: event === "session_start"
					? { type: "session_start", reason: "startup" }
					: event === "session_shutdown"
						? { type: "session_shutdown", reason: "quit" }
						: event === "session_before_compact"
							? COMPACT_EVENT
							: TREE_EVENT);
	return harness.fire(event, payload, ctx);
}

test("valid config registers every enforcement hook exactly", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		assert.deepEqual([...harness.handlerNames()].sort(), [...ENFORCEMENT_EVENTS].sort());
	});
});

test("session_start clamps registry, active, and scoped models", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		const registry = [makeModel(1_000_000), makeModel(200_000)];
		const active = makeModel(2_000_000);
		const scoped = makeModel(3_000_000);
		const ctx = {
			modelRegistry: { getAll: () => registry },
			model: active,
			scopedModels: [{ model: scoped }],
		};
		fireEnforcementEvent(harness, "session_start", ctx);
		assert.equal(registry[0].contextWindow, 350000);
		assert.equal(registry[1].contextWindow, 200000);
		assert.equal(active.contextWindow, 350000);
		assert.equal(scoped.contextWindow, 350000);
	});
});

test("input reapplies the clamp and passes input through unchanged", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		const model = makeModel(1_000_000);
		const results = fireEnforcementEvent(harness, "input", sessionCtx([model]));
		assert.equal(model.contextWindow, 350000);
		assert.deepEqual(results, [undefined], "input handler must not alter input processing");
	});
});

test("context reapplies the clamp before every LLM call, including late models", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		const catalog: { contextWindow: number }[] = [makeModel(1_000_000)];
		const ctx = sessionCtx(catalog);
		fireEnforcementEvent(harness, "session_start", ctx);

		// A provider refresh publishes a fresh model object mid-session; a
		// tool-loop continuation goes straight to a context event.
		const late = makeModel(4_000_000);
		catalog.push(late);
		const results = fireEnforcementEvent(harness, "context", ctx);
		assert.equal(late.contextWindow, 350000);
		assert.equal(catalog[0].contextWindow, 350000);
		assert.deepEqual(results, [undefined], "context handler must return no control flow");
	});
});

test("model-catalog refresh immediately clamps a replacement active model", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		const catalog = [makeModel(1_000_000)];
		const ctx = sessionCtx(catalog);
		fireEnforcementEvent(harness, "session_start", ctx);

		const replacement = makeModel(4_000_000);
		catalog[0] = replacement;
		ctx.model = replacement;
		ctx.scopedModels = [{ model: replacement }];
		const results = harness.emit(MODEL_CATALOG_REFRESHED_EVENT, {
			provider: "cliproxyapi",
		});

		assert.equal(replacement.contextWindow, 350000);
		assert.deepEqual(results, [undefined], "event handler must produce no output");
	});
});

test("model_select clamps the selected model immediately", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		const selected = makeModel(5_000_000);
		// Selected model is not present in the registry at all.
		const ctx = { modelRegistry: { getAll: () => [makeModel(200000)] }, model: undefined, scopedModels: [] };
		fireEnforcementEvent(harness, "model_select", ctx, {
			type: "model_select",
			model: selected,
			previousModel: undefined,
			source: "set",
		});
		assert.equal(selected.contextWindow, 350000);
	});
});

test("session_before_compact and session_before_tree clamp the active model", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		const compactModel = makeModel(1_000_000);
		fireEnforcementEvent(harness, "session_before_compact", sessionCtx([compactModel]));
		assert.equal(compactModel.contextWindow, 350000);

		const treeModel = makeModel(1_000_000);
		const treeResults = fireEnforcementEvent(harness, "session_before_tree", sessionCtx([treeModel]));
		assert.equal(treeModel.contextWindow, 350000);
		assert.deepEqual(treeResults, [undefined], "tree handler must not cancel navigation");
	});
});

test("session_shutdown restores tracked values", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		const model = makeModel(1_000_000);
		const ctx = sessionCtx([model]);
		fireEnforcementEvent(harness, "session_start", ctx);
		assert.equal(model.contextWindow, 350000);
		fireEnforcementEvent(harness, "session_shutdown", ctx);
		assert.equal(model.contextWindow, 1_000_000);
		harness.emit(MODEL_CATALOG_REFRESHED_EVENT, { provider: "cliproxyapi" });
		assert.equal(model.contextWindow, 1_000_000, "shutdown clears the captured session context");
	});
});

test("shutdown followed by a reload with a higher cap applies the higher cap", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const model = makeModel(1_000_000);
		const ctx = sessionCtx([model]);
		const first = createHarness(piContextWindowCap);
		fireEnforcementEvent(first, "session_start", ctx);
		fireEnforcementEvent(first, "session_shutdown", ctx);
		assert.equal(model.contextWindow, 1_000_000);

		writeConfig(900000);
		const second = createHarness(piContextWindowCap);
		fireEnforcementEvent(second, "session_start", ctx);
		assert.equal(model.contextWindow, 900000);
	});
});

test("events tolerate contexts without any models", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		for (const event of ENFORCEMENT_EVENTS) {
			fireEnforcementEvent(harness, event, {});
		}
	});
});

test("valid operation stays silent and returns no user-facing output", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), () => {
		const harness = createHarness(piContextWindowCap);
		const model = makeModel(1_000_000);
		const ctx = sessionCtx([model]);
		const capture = captureWarnings(() => {
			for (const event of ENFORCEMENT_EVENTS) {
				const results = fireEnforcementEvent(harness, event, ctx);
				assert.deepEqual(results, [undefined], `${event} must not produce output`);
			}
		});
		assert.equal(capture.all.length, 0);
		assert.equal(model.contextWindow, 1_000_000, "shutdown restored the original");
	});
});

test("missing config installs no handlers and leaves models unchanged", () => {
	withAgentDir(undefined, () => {
		const harness = createHarness(piContextWindowCap);
		assert.deepEqual(harness.handlerNames(), []);
		const model = makeModel(1_000_000);
		const ctx = sessionCtx([model]);
		for (const event of ENFORCEMENT_EVENTS) {
			fireEnforcementEvent(harness, event, ctx);
		}
		assert.equal(model.contextWindow, 1_000_000);
	});
});

test("invalid config installs no handlers and leaves models unchanged", () => {
	withAgentDir(JSON.stringify({ maxContextWindow: -1 }), () => {
		const capture = captureWarnings(() => {
			const harness = createHarness(piContextWindowCap);
			assert.deepEqual(harness.handlerNames(), []);
			const model = makeModel(1_000_000);
			const ctx = sessionCtx([model]);
			for (const event of ENFORCEMENT_EVENTS) {
				fireEnforcementEvent(harness, event, ctx);
			}
			assert.equal(model.contextWindow, 1_000_000);
		});
		assert.equal(capture.prefixed.length, 1);
	});
});

// ---------------------------------------------------------------------------
// Command registration and status
// ---------------------------------------------------------------------------

test("the command is registered under valid, missing, and invalid startup configs", () => {
	const cases: Array<[label: string, config: string | undefined]> = [
		["valid", JSON.stringify({ maxContextWindow: 350000 })],
		["missing", undefined],
		["invalid", "{ not json"],
	];
	for (const [label, config] of cases) {
		withAgentDir(config, () => {
			const harness = createHarness(piContextWindowCap);
			assert.deepEqual(
				harness.commandNames(),
				[CAP_COMMAND_NAME],
				`${label} startup config must register the command`,
			);
		});
	}
});

test("status reports the saved value for a valid config without mutating the file", async () => {
	const config = JSON.stringify({ maxContextWindow: 350000 });
	await withAgentDir(config, async (dir) => {
		const harness = createHarness(piContextWindowCap);
		const notifications = await harness.runCommand(CAP_COMMAND_NAME, "");
		assert.equal(notifications.length, 1);
		assert.equal(notifications[0].severity, "info");
		assert.ok(notifications[0].message.includes("350000"), notifications[0].message);
		assert.ok(notifications[0].message.includes("Usage:"), notifications[0].message);
		assert.equal(
			readFileSync(join(dir, CAP_CONFIG_FILENAME), "utf-8"),
			config,
			"status must not rewrite the file",
		);
	});
});

test("status reports off for a missing config", async () => {
	await withAgentDir(undefined, async () => {
		const harness = createHarness(piContextWindowCap);
		const notifications = await harness.runCommand(CAP_COMMAND_NAME, "   ");
		assert.equal(notifications.length, 1);
		assert.equal(notifications[0].severity, "info");
		assert.ok(/\boff\b/.test(notifications[0].message), notifications[0].message);
		assert.ok(notifications[0].message.includes("Usage:"), notifications[0].message);
		assert.ok(
			!existsSync(join(process.env.PI_CODING_AGENT_DIR!, CAP_CONFIG_FILENAME)),
			"status must not create the file",
		);
	});
});

test("status reports invalid content with the parser reason and does not repair it", async () => {
	const config = "{ not json";
	await withAgentDir(config, async (dir) => {
		const harness = createHarness(piContextWindowCap);
		const notifications = await harness.runCommand(CAP_COMMAND_NAME, "");
		assert.equal(notifications.length, 1);
		assert.equal(notifications[0].severity, "warning");
		assert.ok(notifications[0].message.includes("malformed JSON"), notifications[0].message);
		assert.equal(
			readFileSync(join(dir, CAP_CONFIG_FILENAME), "utf-8"),
			config,
			"status must not repair the file",
		);
	});
});

test("a missing startup config stays silent while the command stays available", () => {
	withAgentDir(undefined, () => {
		const capture = captureWarnings(() => {
			const harness = createHarness(piContextWindowCap);
			assert.deepEqual(harness.commandNames(), [CAP_COMMAND_NAME]);
		});
		assert.equal(capture.all.length, 0);
	});
});

test("an invalid startup config still warns exactly once with the command available", () => {
	withAgentDir("{ not json", () => {
		const capture = captureWarnings(() => {
			const harness = createHarness(piContextWindowCap);
			assert.deepEqual(harness.commandNames(), [CAP_COMMAND_NAME]);
		});
		assert.equal(capture.prefixed.length, 1);
		assert.equal(capture.all.length, 1);
	});
});

// ---------------------------------------------------------------------------
// Command set/off behavior
// ---------------------------------------------------------------------------

test("set writes the canonical value and notifies that /reload is required", async () => {
	await withAgentDir(undefined, async (dir) => {
		const harness = createHarness(piContextWindowCap);
		const notifications = await harness.runCommand(CAP_COMMAND_NAME, "350k");
		assert.equal(notifications.length, 1);
		assert.equal(notifications[0].severity, "info");
		assert.ok(notifications[0].message.includes("350000"), notifications[0].message);
		assert.ok(notifications[0].message.includes("unchanged"), notifications[0].message);
		assert.ok(notifications[0].message.includes("/reload"), notifications[0].message);
		assert.deepEqual(readCapConfig(dir), { status: "valid", maxContextWindow: 350000 });
	});
});

test("set expands suffixed and fractional inputs into canonical integers", async () => {
	await withAgentDir(undefined, async (dir) => {
		const harness = createHarness(piContextWindowCap);
		await harness.runCommand(CAP_COMMAND_NAME, "350K");
		assert.deepEqual(readCapConfig(dir), { status: "valid", maxContextWindow: 350000 });
		await harness.runCommand(CAP_COMMAND_NAME, "1.5m");
		assert.deepEqual(readCapConfig(dir), { status: "valid", maxContextWindow: 1_500_000 });
		await harness.runCommand(CAP_COMMAND_NAME, "900000");
		assert.deepEqual(readCapConfig(dir), { status: "valid", maxContextWindow: 900000 });
	});
});

test("set preserves unknown keys of a readable object", async () => {
	await withAgentDir(
		JSON.stringify({ note: "local cap", future: [1], maxContextWindow: 1 }),
		async (dir) => {
			const harness = createHarness(piContextWindowCap);
			await harness.runCommand(CAP_COMMAND_NAME, "350k");
			assert.deepEqual(JSON.parse(readConfigText(dir)), {
				note: "local cap",
				future: [1],
				maxContextWindow: 350000,
			});
		},
	);
});

test("set repairs malformed readable content", async () => {
	await withAgentDir("{ not json", async (dir) => {
		const harness = createHarness(piContextWindowCap);
		const notifications = await harness.runCommand(CAP_COMMAND_NAME, "350k");
		assert.equal(notifications[0].severity, "info");
		assert.deepEqual(readCapConfig(dir), { status: "valid", maxContextWindow: 350000 });
	});
});

test("off removes the file case-insensitively and stays idempotent", async () => {
	await withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), async (dir) => {
		const harness = createHarness(piContextWindowCap);
		const first = await harness.runCommand(CAP_COMMAND_NAME, "OFF");
		assert.equal(first.length, 1);
		assert.equal(first[0].severity, "info");
		assert.ok(first[0].message.includes("Disabled"), first[0].message);
		assert.ok(first[0].message.includes("unchanged"), first[0].message);
		assert.ok(first[0].message.includes("/reload"), first[0].message);
		assert.equal(existsSync(join(dir, CAP_CONFIG_FILENAME)), false);

		const second = await harness.runCommand(CAP_COMMAND_NAME, "off");
		assert.equal(second.length, 1);
		assert.equal(second[0].severity, "info");
		assert.ok(second[0].message.includes("/reload"), second[0].message);
		assert.deepEqual(readCapConfig(dir), { status: "missing" });
	});
});

test("invalid input reports an error with usage and leaves disk untouched", async () => {
	const original = JSON.stringify({ maxContextWindow: 350000, note: "keep" });
	for (const input of ["abc", "0", "-5", "1e6", "350k extra", "350,000", "350000.5"]) {
		await withAgentDir(original, async (dir) => {
			const harness = createHarness(piContextWindowCap);
			const notifications = await harness.runCommand(CAP_COMMAND_NAME, input);
			assert.equal(notifications.length, 1, `input ${JSON.stringify(input)}`);
			assert.equal(notifications[0].severity, "error", `input ${JSON.stringify(input)}`);
			assert.ok(notifications[0].message.includes("Usage:"), notifications[0].message);
			assert.equal(
				readConfigText(dir),
				original,
				`input ${JSON.stringify(input)} must not mutate the file`,
			);
		});
	}
});

test("a read failure during set surfaces as an error without success text", async () => {
	await withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), async (dir) => {
		chmodSync(join(dir, CAP_CONFIG_FILENAME), 0o000);
		const harness = createHarness(piContextWindowCap);
		try {
			const notifications = await harness.runCommand(CAP_COMMAND_NAME, "900k");
			assert.equal(notifications.length, 1);
			assert.equal(notifications[0].severity, "error");
			assert.ok(notifications[0].message.includes("Failed"), notifications[0].message);
			assert.ok(!notifications[0].message.includes("run /reload"), notifications[0].message);
		} finally {
			chmodSync(join(dir, CAP_CONFIG_FILENAME), 0o600);
		}
	});
});

test("a write failure during set surfaces as an error and keeps the original bytes", async () => {
	const original = JSON.stringify({ maxContextWindow: 350000 });
	await withAgentDir(original, async (dir) => {
		const harness = createHarness(piContextWindowCap);
		chmodSync(dir, 0o500);
		let notifications: CapturedNotification[];
		try {
			notifications = await harness.runCommand(CAP_COMMAND_NAME, "900k");
		} finally {
			chmodSync(dir, 0o700);
		}
		assert.equal(notifications.length, 1);
		assert.equal(notifications[0].severity, "error");
		assert.ok(notifications[0].message.includes("Failed"), notifications[0].message);
		assert.ok(!notifications[0].message.includes("run /reload"), notifications[0].message);
		assert.equal(readConfigText(dir), original);
	});
});

test("a remove failure during off surfaces as an error without success text", async () => {
	await withAgentDir(undefined, async (dir) => {
		mkdirSync(join(dir, CAP_CONFIG_FILENAME));
		const harness = createHarness(piContextWindowCap);
		try {
			const notifications = await harness.runCommand(CAP_COMMAND_NAME, "off");
			assert.equal(notifications.length, 1);
			assert.equal(notifications[0].severity, "error");
			assert.ok(notifications[0].message.includes("Failed"), notifications[0].message);
			assert.ok(!notifications[0].message.includes("run /reload"), notifications[0].message);
		} finally {
			rmSync(join(dir, CAP_CONFIG_FILENAME), { recursive: true, force: true });
		}
	});
});

test("a status read failure (EACCES) surfaces as an error, not repair guidance", async () => {
	await withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), async (dir) => {
		const harness = createHarness(piContextWindowCap);
		chmodSync(join(dir, CAP_CONFIG_FILENAME), 0o000);
		let notifications: CapturedNotification[];
		try {
			notifications = await harness.runCommand(CAP_COMMAND_NAME, "");
		} finally {
			chmodSync(join(dir, CAP_CONFIG_FILENAME), 0o600);
		}
		assert.equal(notifications.length, 1);
		assert.equal(notifications[0].severity, "error", notifications[0].message);
		assert.ok(notifications[0].message.includes("Failed"), notifications[0].message);
		assert.ok(!notifications[0].message.includes("repair"), notifications[0].message);
		assert.ok(!notifications[0].message.includes("Usage:"), notifications[0].message);
		assert.ok(!notifications[0].message.includes("run /reload"), notifications[0].message);
	});
});

test("a status read of a directory at the config path (EISDIR) surfaces as an error", async () => {
	await withAgentDir(undefined, async (dir) => {
		mkdirSync(join(dir, CAP_CONFIG_FILENAME));
		const harness = createHarness(piContextWindowCap);
		try {
			const notifications = await harness.runCommand(CAP_COMMAND_NAME, "");
			assert.equal(notifications.length, 1);
			assert.equal(notifications[0].severity, "error", notifications[0].message);
			assert.ok(notifications[0].message.includes("Failed"), notifications[0].message);
			assert.ok(!notifications[0].message.includes("repair"), notifications[0].message);
		} finally {
			rmSync(join(dir, CAP_CONFIG_FILENAME), { recursive: true, force: true });
		}
	});
});

test("a rename failure during set cleans up, keeps bytes, and reports only an error", async () => {
	const original = JSON.stringify({ maxContextWindow: 350000 });
	await withAgentDir(original, async (dir) => {
		const harness = createHarness(piContextWindowCap);
		const realRenameSync = capConfigIo.renameSync;
		capConfigIo.renameSync = () => {
			const error = new Error("simulated rename failure (EXDEV)");
			(error as { code?: string }).code = "EXDEV";
			throw error;
		};
		let notifications: CapturedNotification[];
		try {
			notifications = await harness.runCommand(CAP_COMMAND_NAME, "900k");
		} finally {
			capConfigIo.renameSync = realRenameSync;
		}
		assert.equal(notifications.length, 1);
		assert.equal(notifications[0].severity, "error", notifications[0].message);
		assert.ok(notifications[0].message.includes("Failed"), notifications[0].message);
		assert.ok(!notifications[0].message.includes("run /reload"), notifications[0].message);
		assert.ok(!notifications[0].message.includes("unchanged"), notifications[0].message);
		assert.equal(readConfigText(dir), original, "original bytes must be unchanged");
		assert.deepEqual(
			directoryEntries(dir),
			[CAP_CONFIG_FILENAME],
			"the temporary file must be cleaned up after a failed rename",
		);
	});
});

// ---------------------------------------------------------------------------
// Reload-boundary semantics (successive factories simulate /reload)
// ---------------------------------------------------------------------------

test("setting from a missing-config runtime does not clamp until a new factory runs", async () => {
	await withAgentDir(undefined, async () => {
		const first = createHarness(piContextWindowCap);
		assert.deepEqual(first.handlerNames(), []);
		const model = makeModel(1_000_000);
		const ctx = sessionCtx([model]);

		await first.runCommand(CAP_COMMAND_NAME, "350k");
		for (const event of ENFORCEMENT_EVENTS) {
			fireEnforcementEvent(first, event, ctx);
		}
		assert.equal(model.contextWindow, 1_000_000, "no hooks exist in the saving runtime");

		const second = createHarness(piContextWindowCap);
		fireEnforcementEvent(second, "session_start", ctx);
		assert.equal(model.contextWindow, 350000, "the next factory applies the saved cap");
	});
});

test("changing an active cap leaves the current runtime capped at the old value until reload", async () => {
	await withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), async () => {
		const first = createHarness(piContextWindowCap);
		const model = makeModel(1_000_000);
		const ctx = sessionCtx([model]);
		fireEnforcementEvent(first, "session_start", ctx);
		assert.equal(model.contextWindow, 350000);

		await first.runCommand(CAP_COMMAND_NAME, "900k");
		fireEnforcementEvent(first, "input", ctx);
		fireEnforcementEvent(first, "context", ctx);
		assert.equal(model.contextWindow, 350000, "the active controller keeps the old cap");
		assert.deepEqual(
			[...first.handlerNames()].sort(),
			[...ENFORCEMENT_EVENTS].sort(),
			"hook registration must not change after a command mutation",
		);

		fireEnforcementEvent(first, "session_shutdown", ctx);
		assert.equal(model.contextWindow, 1_000_000);

		const second = createHarness(piContextWindowCap);
		fireEnforcementEvent(second, "session_start", ctx);
		assert.equal(model.contextWindow, 900000, "the next factory uses the new cap");
	});
});

test("repairing an invalid startup config through the command arms the next factory", async () => {
	await withAgentDir("{ not json", async () => {
		let created: Harness | undefined;
		const capture = captureWarnings(() => {
			created = createHarness(piContextWindowCap);
		});
		const first = created!;
		assert.equal(capture.prefixed.length, 1, "startup warning still fires exactly once");
		assert.deepEqual(first.handlerNames(), []);

		const notifications = await first.runCommand(CAP_COMMAND_NAME, "350k");
		assert.equal(notifications[0].severity, "info");

		const model = makeModel(1_000_000);
		const ctx = sessionCtx([model]);
		fireEnforcementEvent(first, "session_start", ctx);
		assert.equal(model.contextWindow, 1_000_000, "the repairing runtime stays uncapped");

		let reloaded: Harness | undefined;
		captureWarnings(() => {
			reloaded = createHarness(piContextWindowCap);
		});
		fireEnforcementEvent(reloaded!, "session_start", ctx);
		assert.equal(model.contextWindow, 350000, "the next factory enforces the repaired cap");
	});
});

test("off leaves the active runtime capped until reload, then enforcement disappears", async () => {
	await withAgentDir(JSON.stringify({ maxContextWindow: 350000 }), async () => {
		const first = createHarness(piContextWindowCap);
		const model = makeModel(1_000_000);
		const ctx = sessionCtx([model]);
		fireEnforcementEvent(first, "session_start", ctx);
		assert.equal(model.contextWindow, 350000);

		await first.runCommand(CAP_COMMAND_NAME, "off");
		fireEnforcementEvent(first, "context", ctx);
		assert.equal(model.contextWindow, 350000, "the active controller keeps clamping");

		fireEnforcementEvent(first, "session_shutdown", ctx);
		assert.equal(model.contextWindow, 1_000_000);

		const second = createHarness(piContextWindowCap);
		assert.deepEqual(second.handlerNames(), [], "no enforcement after off plus reload");
		for (const event of ENFORCEMENT_EVENTS) {
			fireEnforcementEvent(second, event, ctx);
		}
		assert.equal(model.contextWindow, 1_000_000, "provider-advertised window stays restored");
	});
});
