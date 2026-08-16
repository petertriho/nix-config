import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	Component,
	TUI,
} from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { type ShellTheme } from "./pi-tui-shell.ts";
import piDashboard, {
	createDashboardComponent,
	discoverDashboardCommands,
	renderDashboard,
	sampleDashboardCommands,
} from "./pi-dashboard.ts";

const plainTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	getBgAnsi: () => "",
	getThinkingBorderColor: () => (text: string) => text,
} as unknown as ShellTheme;

function createDashboardHarness() {
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const pi = {
		on(event: string, handler: (...args: unknown[]) => unknown) {
			const registered = handlers.get(event) ?? [];
			registered.push(handler);
			handlers.set(event, registered);
		},
	} as unknown as ExtensionAPI;

	let headerFactory: ((tui: TUI, theme: ShellTheme) => Component) | undefined;
	let autocompleteProviderFactory:
		| ((provider: AutocompleteProvider) => AutocompleteProvider)
		| undefined;
	let entriesCalls = 0;
	let contextCalls = 0;
	const ui = {
		setHeader(factory: typeof headerFactory) {
			headerFactory = factory;
		},
		addAutocompleteProvider(
			factory: (provider: AutocompleteProvider) => AutocompleteProvider,
		) {
			autocompleteProviderFactory = factory;
		},
		theme: plainTheme,
	};
	const ctx = {
		mode: "tui",
		ui,
		model: undefined,
		getContextUsage: () => {
			contextCalls += 1;
			return undefined;
		},
		sessionManager: {
			getEntries: () => {
				entriesCalls += 1;
				return [];
			},
		},
	} as unknown as ExtensionContext;

	piDashboard(pi);
	return {
		ctx,
		handlers,
		applyAutocompleteProvider(provider: AutocompleteProvider) {
			assert.ok(autocompleteProviderFactory);
			return autocompleteProviderFactory(provider);
		},
		renderHeader(width = 80) {
			assert.ok(headerFactory);
			return headerFactory({} as TUI, plainTheme).render(width);
		},
		getAccountingCalls: () => ({
			entries: entriesCalls,
			context: contextCalls,
		}),
	};
}

function emit(
	handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
	event: string,
	...args: unknown[]
): void {
	for (const handler of handlers.get(event) ?? []) handler(...args);
}

function createCommandProvider(
	items: AutocompleteItem[],
	onQuery?: (lines: string[], cursorLine: number, cursorCol: number) => void,
): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol) {
			onQuery?.(lines, cursorLine, cursorCol);
			return { items, prefix: "/" };
		},
		applyCompletion(lines, cursorLine, cursorCol) {
			return { lines, cursorLine, cursorCol };
		},
	};
}

function assertLinesFit(lines: string[], width: number): void {
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= width,
			`line width ${visibleWidth(line)} exceeds ${width}: ${line}`,
		);
	}
}

const sampleDashboardData = () => ({
	version: "0.84.1",
	commands: [
		{ name: "model", description: "Select model" },
		{ name: "skill:review", description: "Review changes" },
		{ name: "tree", description: "Navigate history" },
		{ name: "hotkeys", description: "Show shortcuts" },
	],
	commandsLoading: false,
});

test("dashboard renders discovered commands and strips controls", () => {
	const rendered = renderDashboard(
		plainTheme,
		{
			version: "test",
			commands: [
				{ name: "model", description: "Select model" },
				{
					name: "\x1b[2Jskill:review",
					description: "Review code\x07 safely",
				},
				{ name: "tree", description: "Navigate history" },
				{ name: "hotkeys", description: "Show shortcuts" },
			],
			commandsLoading: false,
		},
		100,
	).join("\n");
	assert.match(rendered, /COMMAND DECK/);
	assert.match(rendered, /type \/ to browse/);
	assert.match(rendered, /\/model.*Select model/);
	assert.match(rendered, /\/skill:review.*Review code safely/);
	assert.equal(rendered.includes("\x1b[2J"), false);
	assert.equal(rendered.includes("\x07"), false);
	const commandColumns = rendered
		.split("\n")
		.filter((line) => /\d{2}\s+\//.test(line))
		.map((line) => line.indexOf("/"));
	assert.equal(new Set(commandColumns).size, 1);
});

test("dashboard rows fit representative terminal widths", () => {
	const dashboard = sampleDashboardData();

	for (const width of [120, 80, 60, 40, 26]) {
		const dashboardRows = renderDashboard(plainTheme, dashboard, width);
		assertLinesFit(dashboardRows, width);
	}

	const wide = renderDashboard(plainTheme, dashboard, 120).join("\n");
	assert.match(wide, /██████.*COMMAND DECK/);
	const sixty = renderDashboard(plainTheme, dashboard, 60).join("\n");
	assert.match(sixty, /COMMAND DECK/);
	assert.match(sixty, /\/model.*Select model/);
	const stackedLines = renderDashboard(plainTheme, dashboard, 40);
	assert.equal(
		stackedLines.some(
			(line) => line.includes("████") && line.includes("COMMAND DECK"),
		),
		false,
	);
});

test("command discovery mirrors slash autocomplete and deduplicates", async () => {
	let query:
		| { lines: string[]; cursorLine: number; cursorCol: number }
		| undefined;
	const commands = await discoverDashboardCommands(
		createCommandProvider(
			[
				{ value: "model", label: "model", description: "Select model" },
				{
					value: "skill:review",
					label: "skill:review",
					description: "Review changes",
				},
				{ value: "/model", label: "model", description: "Duplicate" },
				{ value: "\x1b[2Jtree", label: "tree" },
			],
			(lines, cursorLine, cursorCol) => {
				query = { lines, cursorLine, cursorCol };
			},
		),
	);
	assert.deepEqual(query, { lines: ["/"], cursorLine: 0, cursorCol: 1 });
	assert.deepEqual(commands, [
		{ name: "model", description: "Select model" },
		{ name: "skill:review", description: "Review changes" },
		{ name: "tree" },
	]);
});

test("command sampling is deterministic and does not mutate the pool", () => {
	const commands = ["one", "two", "three", "four", "five"].map((name) => ({
		name,
		description: `Run ${name}`,
	}));
	const values = [0.8, 0.1, 0.6, 0.2];
	const sample = () => {
		let index = 0;
		return sampleDashboardCommands(commands, 4, () => values[index++] ?? 0);
	};
	const first = sample();
	const second = sample();
	assert.deepEqual(second, first);
	assert.equal(first.length, 4);
	assert.equal(new Set(first.map((command) => command.name)).size, 4);
	assert.deepEqual(
		commands.map((command) => command.name),
		["one", "two", "three", "four", "five"],
	);
});

test("dashboard component caches rows until command inputs change", () => {
	const command = { name: "model", description: "Select model" };
	const data = {
		version: "test",
		commands: [command],
		commandsLoading: false,
	};
	const component = createDashboardComponent(plainTheme, () => data);
	const first = component.render(80);
	const cached = component.render(80);
	assert.strictEqual(cached, first);

	command.description = "Switch model";
	const changed = component.render(80);
	assert.notStrictEqual(changed, first);
	assert.match(changed.join("\n"), /\/model.*Switch model/);

	data.commands.push({ name: "tree", description: "Navigate history" });
	const expanded = component.render(80);
	assert.notStrictEqual(expanded, changed);
	assert.match(expanded.join("\n"), /\/tree.*Navigate history/);

	component.invalidate();
	assert.notStrictEqual(component.render(80), expanded);
});

test("extension discovers commands without reading session history", async () => {
	const harness = createDashboardHarness();
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start" },
		harness.ctx,
	);
	const provider = createCommandProvider([
		{ value: "model", label: "model", description: "Select model" },
		{ value: "ext:doctor", label: "ext:doctor", description: "Run doctor" },
		{ value: "review", label: "review", description: "Review changes" },
		{ value: "skill:test", label: "skill:test", description: "Run tests" },
	]);
	const originalRandom = Math.random;
	try {
		Math.random = () => 0;
		assert.strictEqual(harness.applyAutocompleteProvider(provider), provider);
		await Promise.resolve();
		await Promise.resolve();

		const header = harness.renderHeader(100).join("\n");
		assert.match(header, /\/model.*Select model/);
		assert.match(header, /\/ext:doctor.*Run doctor/);
		assert.match(header, /\/review.*Review changes/);
		assert.match(header, /\/skill:test.*Run tests/);
		assert.deepEqual(harness.getAccountingCalls(), { entries: 0, context: 0 });

		Math.random = () => 1 - Number.EPSILON;
		assert.strictEqual(harness.applyAutocompleteProvider(provider), provider);
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(harness.renderHeader(100).join("\n"), header);
	} finally {
		Math.random = originalRandom;
		emit(
			harness.handlers,
			"session_shutdown",
			{ type: "session_shutdown" },
			harness.ctx,
		);
	}
});
