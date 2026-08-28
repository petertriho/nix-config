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
import {
	stripTerminalSequences,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { ShellTheme } from "./pi-tui-shell.ts";
import piDashboard, {
	calculateDashboardColumns,
	centerDashboardText,
	createDashboardComponent,
	DASHBOARD_ANIMATION_INTERVAL_MS,
	DASHBOARD_COMMAND_GRID_BREAKPOINT,
	DASHBOARD_LOGO_CELL_WIDTH,
	DASHBOARD_LOGO_FRAME_COUNT,
	DASHBOARD_LOGO_FRAMES,
	type DashboardData,
	discoverDashboardCommands,
	formatDashboardCommandCell,
	formatDashboardCwd,
	formatDashboardDirectory,
	formatDashboardModelIdentity,
	padDashboardText,
	renderDashboardBottomBorder,
	renderDashboardBoxRow,
	renderDashboardDivider,
	renderDashboard,
	renderDashboardLogo,
	renderDashboardTopBorder,
	renderCompactWideDashboardSidebar,
	renderGridWideDashboardSidebar,
	renderWideDashboardHero,
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
	const fakeTimers = createFakeDashboardTimers();
	let sessionName: string | undefined;
	let thinkingLevel = "high";
	const pi = {
		on(event: string, handler: (...args: unknown[]) => unknown) {
			const registered = handlers.get(event) ?? [];
			registered.push(handler);
			handlers.set(event, registered);
		},
		getSessionName: () => sessionName,
		getThinkingLevel: () => thinkingLevel,
	} as unknown as ExtensionAPI;

	let headerFactory:
		| ((
				tui: TUI,
				theme: ShellTheme,
		  ) => Component & { dispose?(): void })
		| undefined;
	let activeHeader: (Component & { dispose?(): void }) | undefined;
	let autocompleteProviderFactory:
		| ((provider: AutocompleteProvider) => AutocompleteProvider)
		| undefined;
	let entriesCalls = 0;
	let contextCalls = 0;
	let requestRenderCount = 0;
	const tui = {
		requestRender() {
			requestRenderCount += 1;
		},
	} as TUI;
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
		cwd: "/tmp/pi-dashboard",
		ui,
		model: {
			provider: "anthropic",
			id: "claude-sonnet-4",
		},
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

	piDashboard(pi, fakeTimers.timers);
	return {
		ctx,
		handlers,
		timers: fakeTimers,
		applyAutocompleteProvider(provider: AutocompleteProvider) {
			assert.ok(autocompleteProviderFactory);
			return autocompleteProviderFactory(provider);
		},
		mountHeader() {
			assert.ok(headerFactory);
			activeHeader = headerFactory(tui, plainTheme);
			return activeHeader;
		},
		renderHeader(width = 80) {
			activeHeader ??= this.mountHeader();
			return activeHeader.render(width);
		},
		getHeader: () => activeHeader,
		hasHeaderFactory: () => headerFactory !== undefined,
		hasAutocompleteProvider: () => autocompleteProviderFactory !== undefined,
		getRequestRenderCount: () => requestRenderCount,
		resetRequestRenderCount() {
			requestRenderCount = 0;
		},
		setMode(mode: ExtensionContext["mode"]) {
			(ctx as { mode: ExtensionContext["mode"] }).mode = mode;
		},
		setSessionName(name: string | undefined) {
			sessionName = name;
		},
		setThinkingLevel(level: string) {
			thinkingLevel = level;
		},
		setModel(provider: string, id: string) {
			(ctx as unknown as { model: { provider: string; id: string } }).model = {
				provider,
				id,
			};
		},
		setCwd(cwd: string) {
			(ctx as unknown as { cwd: string }).cwd = cwd;
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

function dashboardWideColumns(
	line: string,
	width: number,
): { left: string; divider: string; right: string } {
	const boxWidth = width - 2;
	const innerWidth = boxWidth - 2;
	const columns = calculateDashboardColumns(innerWidth);
	const plain = stripTerminalSequences(line);
	const box = plain.slice(1, -1);
	assert.equal(visibleWidth(box), boxWidth);
	assert.equal(box[0], "│");
	assert.equal(box.at(-1), "│");
	const content = box.slice(1, -1);
	return {
		left: content.slice(0, columns.left),
		divider: content.slice(
			columns.left,
			columns.left + columns.divider,
		),
		right: content.slice(columns.left + columns.divider),
	};
}

function dashboardBoxContent(line: string, width: number): string {
	const boxWidth = width - 2;
	const plain = stripTerminalSequences(line);
	const box = plain.slice(1, -1);
	assert.equal(visibleWidth(box), boxWidth);
	assert.equal(box[0], "│");
	assert.equal(box.at(-1), "│");
	return box.slice(1, -1);
}

function createFakeDashboardTimers() {
	let nextId = 0;
	let clearCount = 0;
	const callbacks = new Map<
		object,
		{ callback: () => void; delay: number }
	>();
	return {
		timers: {
			setInterval(callback: () => void, delay: number) {
				const token = { id: ++nextId };
				callbacks.set(token, { callback, delay });
				return token as unknown as ReturnType<typeof setInterval>;
			},
			clearInterval(timer: ReturnType<typeof setInterval>) {
				if (callbacks.delete(timer as unknown as object)) clearCount += 1;
			},
		},
		advance() {
			for (const { callback } of [...callbacks.values()]) callback();
		},
		get activeCount() {
			return callbacks.size;
		},
		get clearCount() {
			return clearCount;
		},
		get delays() {
			return [...callbacks.values()].map(({ delay }) => delay);
		},
	};
}

const sampleDashboardData = (): DashboardData => ({
	version: "0.84.1",
	model: { provider: "anthropic", id: "claude-sonnet-4" },
	thinkingLevel: "high",
	cwd: "/tmp/pi-dashboard",
	commands: [
		{ name: "model", description: "Select model" },
		{ name: "skill:review", description: "Review changes" },
		{ name: "tree", description: "Navigate history" },
		{ name: "hotkeys", description: "Show shortcuts" },
		{ name: "theme", description: "Pick a theme" },
		{ name: "mcp", description: "Manage MCP servers" },
	],
	commandsLoading: false,
});

test("dashboard display formatters sanitize metadata and provide fallbacks", () => {
	assert.equal(formatDashboardCwd("/tmp/pi\x07-dashboard"), "/tmp/pi -dashboard");
});

test("hero identity and directory formatters mirror rail styling with a compaction ladder", () => {
	const styled: Array<{ color: string; text: string }> = [];
	const recordingTheme = {
		...plainTheme,
		fg: (color: string, text: string) => {
			styled.push({ color, text });
			return text;
		},
	} as unknown as ShellTheme;
	const model = { provider: "anthropic\x07", id: "\x1b[2Jclaude-sonnet-4" };

	assert.equal(
		formatDashboardModelIdentity(recordingTheme, model, "high", 38),
		"anthropic/claude-sonnet-4 · think high",
	);
	assert.deepEqual(styled, [
		{ color: "accent", text: "anthropic" },
		{ color: "dim", text: "/" },
		{ color: "text", text: "claude-sonnet-4" },
		{ color: "dim", text: " · " },
		{ color: "muted", text: "think " },
	]);

	styled.length = 0;
	assert.equal(
		formatDashboardDirectory(recordingTheme, "/tmp/pi\x07-dashboard", 26),
		"/tmp/pi -dashboard",
	);
	assert.deepEqual(styled, [{ color: "accent", text: "/tmp/pi -dashboard" }]);

	// Compaction ladder: drop the provider, then the `think ` label, then
	// ellipsize the id.
	assert.equal(
		formatDashboardModelIdentity(plainTheme, model, "high", 37),
		"claude-sonnet-4 · think high",
	);
	assert.equal(
		formatDashboardModelIdentity(plainTheme, model, "high", 22),
		"claude-sonnet-4 · high",
	);
	assert.equal(
		stripTerminalSequences(
			formatDashboardModelIdentity(plainTheme, model, "high", 21),
		),
		"claude-sonnet… · high",
	);
	assert.equal(
		formatDashboardModelIdentity(plainTheme, model, "high", 7),
		"high",
	);
	assert.equal(
		stripTerminalSequences(
			formatDashboardModelIdentity(plainTheme, model, "high", 3),
		),
		"hi…",
	);
	assert.equal(formatDashboardModelIdentity(plainTheme, model, "high", 0), "");

	// Fallbacks: muted `Model unavailable`, `off` thinking.
	assert.equal(
		formatDashboardModelIdentity(plainTheme, undefined, "high", 30),
		"Model unavailable · think high",
	);
	assert.equal(
		formatDashboardModelIdentity(plainTheme, undefined, "high", 24),
		"Model unavailable · high",
	);
	assert.equal(
		formatDashboardModelIdentity(plainTheme, model, undefined, 38),
		"anthropic/claude-sonnet-4 · think off",
	);
	assert.equal(
		stripTerminalSequences(
			formatDashboardModelIdentity(plainTheme, model, undefined, 20),
		),
		"claude-sonnet… · off",
	);

	// Directory tail compaction keeps the path end visible.
	assert.equal(
		formatDashboardDirectory(
			plainTheme,
			`/tmp/${"nested/".repeat(30)}dashboard`,
			20,
		),
		"/…/dashboard",
	);
	assert.equal(
		formatDashboardDirectory(plainTheme, "/tmp/pi-dashboard", 10),
		"/…/shboard",
	);
	assert.equal(formatDashboardDirectory(plainTheme, "/tmp/pi-dashboard", 0), "");

	// ANSI-bearing themes stay width-safe at every rung.
	const ansiTheme = {
		...plainTheme,
		fg: (_color: string, text: string) => `\x1b[35m${text}\x1b[0m`,
	} as unknown as ShellTheme;
	// Hero column widths at the 90/109/110/120 terminal breakpoints.
	for (const width of [26, 31, 32, 35, 38, 24, 21, 12, 7, 3, 1]) {
		assert.ok(
			visibleWidth(
				formatDashboardModelIdentity(ansiTheme, model, "high", width),
			) <= width,
			`identity width ${width}`,
		);
	}
	for (const width of [30, 17, 12, 3, 1]) {
		assert.ok(
			visibleWidth(
					formatDashboardDirectory(
						ansiTheme,
						"/tmp/some-long-directory-path",
						width,
					),
			) <= width,
			`directory width ${width}`,
		);
	}
});

test("dashboard logo frames are deterministic and settle entirely to accent", () => {
	const semanticColors: string[] = [];
	const recordingTheme = {
		...plainTheme,
		fg: (color: string, text: string) => {
			if (text.trim()) semanticColors.push(color);
			return text;
		},
	} as unknown as ShellTheme;

	const first = renderDashboardLogo(recordingTheme, 0);
	const repeated = renderDashboardLogo(recordingTheme, 0);
	assert.deepEqual(repeated, first);
	assert.equal(first.length, 4);
	assert.ok(first.some((row) => row.trim().length > 0));
	assert.equal(DASHBOARD_LOGO_CELL_WIDTH, 2);
	assert.equal(Math.max(...first.map(visibleWidth)), 8);
	assert.equal(DASHBOARD_LOGO_FRAME_COUNT, 8);

	semanticColors.length = 0;
	for (let frame = 0; frame < DASHBOARD_LOGO_FRAME_COUNT; frame += 1) {
		renderDashboardLogo(recordingTheme, frame);
	}
	assert.ok(
		semanticColors.every((color) =>
			["accent", "error", "success"].includes(color),
		),
	);
	assert.deepEqual(
		new Set(semanticColors),
		new Set(["accent", "error", "success"]),
	);

	const occupiedCells = (frame: (typeof DASHBOARD_LOGO_FRAMES)[number]) =>
		new Set(
			frame.flatMap((row, rowIndex) =>
				row.flatMap((color, columnIndex) =>
					color ? [`${rowIndex}:${columnIndex}`] : [],
				),
			),
		);
	let revealed = new Set<string>();
	for (const frame of DASHBOARD_LOGO_FRAMES) {
		const occupied = occupiedCells(frame);
		for (const cell of revealed) {
			assert.ok(occupied.has(cell), `revealed logo cell disappeared: ${cell}`);
		}
		revealed = occupied;
	}

	semanticColors.length = 0;
	const finalFrame = renderDashboardLogo(
		recordingTheme,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	);
	assert.equal(Math.max(...finalFrame.map(visibleWidth)), 8);
	assert.ok(finalFrame.every((row) => row.trim().length > 0));
	assert.deepEqual(new Set(semanticColors), new Set(["accent"]));
	assert.ok(
		DASHBOARD_LOGO_FRAMES.at(-1)?.every((row) =>
			row.every((color) => color === undefined || color === "accent"),
		),
	);
});

test("dashboard box and column helpers preserve complete width-safe edges", () => {
	const width = 32;
	const rows = [
		renderDashboardTopBorder(plainTheme, width, "Pi v0.84.1"),
		renderDashboardBoxRow(
			plainTheme,
			width,
			"\x1b[31mSession with a deliberately long title\x1b[0m",
		),
		renderDashboardDivider(plainTheme, width),
		renderDashboardBoxRow(
			plainTheme,
			width,
			centerDashboardText("center", width - 2),
		),
		renderDashboardBottomBorder(plainTheme, width),
	];

	assert.ok(rows[0]?.startsWith("╭"));
	assert.ok(rows[0]?.endsWith("╮"));
	assert.ok(rows[1]?.startsWith("│"));
	assert.ok(rows[1]?.endsWith("│"));
	assert.ok(rows[2]?.startsWith("├"));
	assert.ok(rows[2]?.endsWith("┤"));
	assert.ok(rows[4]?.startsWith("╰"));
	assert.ok(rows[4]?.endsWith("╯"));
	for (const row of rows) assert.equal(visibleWidth(row), width);

	const padded = padDashboardText("\x1b[31mabcdef\x1b[0m", 4);
	assert.equal(visibleWidth(padded), 4);
});

test("wide dashboard columns use the exact 30/70 contract and grid breakpoint", () => {
	assert.equal(DASHBOARD_COMMAND_GRID_BREAKPOINT, 110);

	for (const terminalWidth of [90, 109, 110, 120, 200]) {
		const innerWidth = terminalWidth - 4;
		const columns = calculateDashboardColumns(innerWidth);
		const usableWidth = innerWidth - 1;
		assert.equal(columns.divider, 1);
		assert.equal(
			columns.left + columns.divider + columns.sidebar,
			innerWidth,
		);
		assert.equal(columns.left, Math.round(usableWidth * 0.3));
		assert.equal(columns.sidebar, usableWidth - columns.left);
	}

	assert.deepEqual(calculateDashboardColumns(0), {
		left: 0,
		divider: 0,
		sidebar: 0,
	});
	assert.deepEqual(calculateDashboardColumns(-10), {
		left: 0,
		divider: 0,
		sidebar: 0,
	});
	assert.deepEqual(calculateDashboardColumns(Number.NaN), {
		left: 0,
		divider: 0,
		sidebar: 0,
	});
	assert.deepEqual(calculateDashboardColumns(2.9), {
		left: 0,
		divider: 1,
		sidebar: 1,
	});

	const uncapped = calculateDashboardColumns(196);
	assert.equal(uncapped.sidebar, 136);
});

test("command cells preserve styling, descriptions, sanitization, and exact width", () => {
	const styled: Array<{ color: string; text: string }> = [];
	const recordingTheme = {
		...plainTheme,
		fg: (color: string, text: string) => {
			styled.push({ color, text });
			return text;
		},
	} as unknown as ShellTheme;

	const roomy = formatDashboardCommandCell(
		recordingTheme,
		{ name: "model", description: "Select model" },
		28,
		true,
	);
	assert.equal(visibleWidth(roomy), 28);
	assert.match(roomy, /^\/model {2}Select model/);
	assert.deepEqual(styled.slice(0, 2), [
		{ color: "text", text: "/model" },
		{ color: "dim", text: "Select model" },
	]);

	styled.length = 0;
	const later = formatDashboardCommandCell(
		recordingTheme,
		{
			name: "\x1b[2Jskill:review\x07",
			description: "Review \x1b[31mchanges\x1b[0m safely\x07",
		},
		24,
		true,
	);
	assert.equal(visibleWidth(later), 24);
	assert.match(later, /^\/skill:review {2}Review/);
	assert.equal(later.includes("\x1b[2J"), false);
	assert.equal(later.includes("\x07"), false);
	assert.equal(styled[0]?.color, "text");
	assert.equal(styled[1]?.color, "dim");

	const narrow = formatDashboardCommandCell(
		recordingTheme,
		{ name: "model", description: "Select model" },
		10,
		true,
	);
	assert.equal(visibleWidth(narrow), 10);
	assert.match(narrow, /^\/model\s+$/);
	assert.doesNotMatch(narrow, /Select/);

	const truncated = formatDashboardCommandCell(
		recordingTheme,
		{ name: "very-long-command", description: "Description" },
		9,
		true,
	);
	assert.equal(visibleWidth(truncated), 9);
	assert.match(stripTerminalSequences(truncated), /^\/very-lo…$/);

	const namesOnly = formatDashboardCommandCell(
		recordingTheme,
		{ name: "tree", description: "Navigate history" },
		12,
		false,
	);
	assert.equal(visibleWidth(namesOnly), 12);
	assert.match(namesOnly, /^\/tree\s+$/);
	assert.doesNotMatch(namesOnly, /Navigate/);

	assert.equal(
		formatDashboardCommandCell(
			recordingTheme,
			{ name: "model", description: "Select model" },
			0,
			true,
		),
		"",
	);
});

test("compact wide sidebar leads with the unified action header in nine rows", () => {
	for (const terminalWidth of [90, 109]) {
		const sidebarWidth = calculateDashboardColumns(terminalWidth - 4).sidebar;
		const pool = sampleDashboardData().commands;
		const loaded = renderCompactWideDashboardSidebar(
			plainTheme,
			sampleDashboardData(),
			sidebarWidth,
		).map(stripTerminalSequences);

		assert.equal(loaded.length, 9);
		assert.ok(loaded.every((row) => visibleWidth(row) === sidebarWidth));
		assert.equal(loaded[0]?.trim(), "Quick actions");
		assert.equal(loaded[1]?.trim(), "Type / to browse commands");
		assert.equal(loaded[2]?.trim(), "Commands");
		assert.match(loaded[3] ?? "", /^\/model {2}Select model/);
		assert.match(loaded[4] ?? "", /^\/skill:review {2}Review changes/);
		assert.match(loaded[5] ?? "", /^\/tree {2}Navigate history/);
		assert.match(loaded[6] ?? "", /^\/hotkeys {2}Show shortcuts/);
		assert.match(loaded[7] ?? "", /^\/theme {2}Pick a theme/);
		assert.match(loaded[8] ?? "", /^\/mcp {2}Manage MCP servers/);
		assert.ok(loaded.every((row) => row.trim().length > 0));
		assert.ok(loaded.every((row) => !row.includes("│")));
		assert.doesNotMatch(
			loaded.join("\n"),
			/anthropic|Thinking|\/tmp\/pi-dashboard/,
		);

		// Counts 1–6 flow commands; the 0-command state is covered by the
		// dedicated empty assertion below (status row, not blank).
		for (let count = 1; count <= 6; count += 1) {
			const rows = renderCompactWideDashboardSidebar(
				plainTheme,
				{ ...sampleDashboardData(), commands: pool.slice(0, count) },
				sidebarWidth,
			).map(stripTerminalSequences);
			assert.equal(rows.length, 9, `count ${count}`);
			for (let index = 3; index < 9; index += 1) {
				const row = rows[index] ?? "";
				if (index - 3 < count) {
					assert.match(
						row,
						new RegExp(`^\\/${pool[index - 3]?.name} `),
						`count ${count} row ${index}`,
					);
				} else {
					assert.equal(row.trim(), "", `count ${count} row ${index}`);
				}
			}
		}

		const loading = renderCompactWideDashboardSidebar(
			plainTheme,
			{
				...sampleDashboardData(),
				commands: [],
				commandsLoading: true,
			},
			sidebarWidth,
		).map(stripTerminalSequences);
		assert.match(loading[3] ?? "", /^Discovering commands…/);
		assert.equal(visibleWidth(loading[3] ?? ""), sidebarWidth);
		assert.equal(loading[4]?.trim(), "");
		assert.equal(loading[5]?.trim(), "");
		assert.equal(loading[6]?.trim(), "");
		assert.equal(loading[7]?.trim(), "");
		assert.equal(loading[8]?.trim(), "");

		const empty = renderCompactWideDashboardSidebar(
			plainTheme,
			{
				...sampleDashboardData(),
				commands: [],
				commandsLoading: false,
			},
			sidebarWidth,
		).map(stripTerminalSequences);
		assert.match(empty[3] ?? "", /^No suggestions yet/);
		assert.equal(visibleWidth(empty[3] ?? ""), sidebarWidth);
		assert.equal(empty[4]?.trim(), "");
		assert.equal(empty[5]?.trim(), "");
		assert.equal(empty[6]?.trim(), "");
		assert.equal(empty[7]?.trim(), "");
		assert.equal(empty[8]?.trim(), "");
	}
});

test("grid wide sidebar packs commands row-major behind a ruled unified header", () => {
	const sidebarWidth = calculateDashboardColumns(110 - 4).sidebar;
	const commands = [
		{ name: "one", description: "First command" },
		{ name: "two", description: "Second command" },
		{ name: "three", description: "Third command" },
		{ name: "four", description: "Fourth command" },
		{ name: "five", description: "Fifth command" },
		{ name: "six", description: "Sixth command" },
		{ name: "seven", description: "Seventh command" },
		{ name: "eight", description: "Eighth command" },
		{ name: "nine", description: "Ninth command" },
		{ name: "ten", description: "Tenth command" },
	];

	for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
		const rows = renderGridWideDashboardSidebar(
			plainTheme,
			{
				...sampleDashboardData(),
				commands: commands.slice(0, count),
			},
			sidebarWidth,
		).map(stripTerminalSequences);

		assert.equal(rows.length, 9, `count ${count}`);
		assert.ok(rows.every((row) => visibleWidth(row) === sidebarWidth));
		assert.equal(rows[0]?.trim(), "Quick actions");
		assert.equal(rows[1]?.trim(), "Type / to browse commands");
		assert.equal(rows[2], "─".repeat(sidebarWidth));
		assert.equal(rows[3]?.trim(), "Commands");
		assert.match(rows[4] ?? "", /^\/one {2}First command/);

		for (let row = 0; row < 5; row += 1) {
			const text = rows[4 + row] ?? "";
			const rowCommands = commands.slice(2 * row, 2 * row + 2);
			if (count <= 2 * row) {
				assert.equal(text.trim(), "", `count ${count} row ${4 + row}`);
				continue;
			}
			const first = rowCommands[0];
			assert.ok(first, `count ${count} row ${4 + row}`);
			assert.match(
				text,
				new RegExp(`^\\/${first.name} {2}${first.description}`),
				`count ${count} row ${4 + row}`,
			);
			assert.equal(
				(text.match(/ │ /g) ?? []).length,
				count >= 2 * row + 2 ? 1 : 0,
				`count ${count} row ${4 + row}`,
			);
			if (count >= 2 * row + 2) {
				const second = rowCommands[1];
				assert.ok(second, `count ${count} row ${4 + row}`);
				assert.ok(
					text.indexOf(`/${first.name}`) < text.indexOf(`/${second.name}`),
					`count ${count} row ${4 + row}`,
				);
			}
		}
	}

	const longRows = renderGridWideDashboardSidebar(
		plainTheme,
		{
			...sampleDashboardData(),
			commands: [
				{
					name: `\x1b[2J${"long-command-".repeat(8)}\x07`,
					description: `\x1b[31m${"long description ".repeat(10)}\x1b[0m`,
				},
				{ name: "two", description: "Second command" },
				{ name: "three", description: "Third command" },
			],
		},
		sidebarWidth,
	);
	assert.ok(longRows.every((row) => visibleWidth(row) === sidebarWidth));
	assert.match(stripTerminalSequences(longRows[4] ?? ""), /….* │ \/two/);
	assert.match(stripTerminalSequences(longRows[5] ?? ""), /^\/three {2}Third command/);
	assert.equal(stripTerminalSequences(longRows.join("\n")).includes("\x1b[2J"), false);
	assert.equal(stripTerminalSequences(longRows.join("\n")).includes("\x07"), false);

	for (const state of [
		{ commandsLoading: true, expected: "Discovering commands…" },
		{ commandsLoading: false, expected: "No suggestions yet" },
	]) {
		const rows = renderGridWideDashboardSidebar(
			plainTheme,
			{
				...sampleDashboardData(),
				commands: [],
				commandsLoading: state.commandsLoading,
			},
			sidebarWidth,
		).map(stripTerminalSequences);
		assert.equal(rows.length, 9);
		assert.match(rows[4] ?? "", new RegExp(`^${state.expected}`));
		assert.equal(visibleWidth(rows[4] ?? ""), sidebarWidth);
		assert.equal((rows[4]?.match(/ │ /g) ?? []).length, 0);
		assert.equal(rows[5]?.trim(), "");
		assert.equal(rows[6]?.trim(), "");
		assert.equal(rows[7]?.trim(), "");
		assert.equal(rows[8]?.trim(), "");
	}
});

test("section titles render accent and command names uniform across layouts", () => {
	const styled: Array<{ color: string; text: string }> = [];
	const recordingTheme = {
		...plainTheme,
		fg: (color: string, text: string) => {
			styled.push({ color, text });
			return text;
		},
	} as unknown as ShellTheme;
	const dashboard = sampleDashboardData();

	const renders = [
		...renderCompactWideDashboardSidebar(
			recordingTheme,
			dashboard,
			calculateDashboardColumns(100 - 4).sidebar,
		),
		...renderGridWideDashboardSidebar(
			recordingTheme,
			dashboard,
			calculateDashboardColumns(120 - 4).sidebar,
		),
		...renderDashboard(recordingTheme, dashboard, 80),
	];
	assert.ok(renders.length > 0);

	const titles = styled.filter(
		({ text }) => text === "Quick actions" || text === "Commands",
	);
	assert.equal(titles.length, 6);
	assert.ok(titles.every(({ color }) => color === "accent"));

	const isCommandName = ({ text }: { color: string; text: string }): boolean =>
		text.length > 1 && text.startsWith("/") && !text.slice(1).includes("/");
	const commandSpans = styled.filter(isCommandName);
	assert.ok(commandSpans.length > 0);
	assert.ok(commandSpans.every(({ color }) => color === "text"));
	const accentSpans = styled.filter(({ color }) => color === "accent");
	assert.ok(!accentSpans.some(isCommandName));
});

test("dashboard renders discovered commands and strips controls", () => {
	const rendered = renderDashboard(
		plainTheme,
		{
			...sampleDashboardData(),
			version: "test",
			model: {
				provider: "anthropic\x07",
				id: "\x1b[2Jclaude-sonnet-4",
			},
			thinkingLevel: "high",
			cwd: "/tmp/pi\x07-dashboard",
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
		120,
	).join("\n");
	assert.match(rendered, /Pi vtest/);
	assert.doesNotMatch(rendered, /Launch plan|Untitled session/);
	assert.match(rendered, /claude-sonnet-4 · think high/);
	assert.match(rendered, /\/tmp\/pi -dashboard/);
	assert.match(rendered, /Quick actions/);
	assert.match(rendered, /Type \/ to browse commands/);
	assert.match(rendered, /\/model.*Select model/);
	assert.match(rendered, /\/skill:review.*Review code/);
	assert.equal(rendered.includes("\x1b[2J"), false);
	assert.equal(rendered.includes("\x07"), false);
});

test("dashboard rows fit representative terminal widths", () => {
	const dashboard = sampleDashboardData();
	const expectedRows: Record<number, number> = {
		180: 11,
		120: 11,
		110: 11,
		109: 11,
		90: 11,
		89: 16,
		80: 16,
		60: 16,
		40: 16,
		26: 16,
		23: 1,
	};

	for (const width of [180, 120, 110, 109, 90, 89, 80, 60, 40, 26, 23]) {
		const dashboardRows = renderDashboard(plainTheme, dashboard, width);
		assert.equal(dashboardRows.length, expectedRows[width], `width ${width}`);
		assertLinesFit(dashboardRows, width);
		for (const line of dashboardRows) {
			if (!line) continue;
			assert.ok(line.startsWith(" "), `missing left margin at ${width}: ${line}`);
			assert.ok(line.endsWith(" "), `missing right margin at ${width}: ${line}`);
		}
	}

	const wideLines = renderDashboard(plainTheme, dashboard, 120);
	const wide = wideLines.join("\n");
	assert.ok(wideLines[0]?.trim().startsWith("╭─ Pi v0.84.1"));
	assert.ok(wideLines[0]?.trim().endsWith("╮"));
	assert.ok(wideLines.at(-1)?.trim().startsWith("╰"));
	assert.ok(wideLines.at(-1)?.trim().endsWith("╯"));
	for (const line of wideLines.slice(1, -1)) {
		assert.match(line.trim(), /^│.*│$/);
	}
	assert.match(wide, /████.*Type \/ to browse commands/);
	assert.match(wide, /Quick actions/);
	assert.match(wide, /claude-sonnet-4 · think high/);
	assert.match(wide, /\/tmp\/pi-dashboard/);
	assert.match(wide, /\/model.*Select model/);
	assert.match(wide, /\/hotkeys.*Show shortcuts/);

	for (const width of [80, 60, 40, 26]) {
		const mediumLines = renderDashboard(plainTheme, dashboard, width);
		const medium = mediumLines.join("\n");
		assert.ok(mediumLines[0]?.trim().startsWith("╭─ Pi v0.84.1"));
		assert.ok(mediumLines.at(-1)?.trim().startsWith("╰"));
		for (const line of mediumLines.slice(1, -1)) {
			assert.match(line.trim(), /^(?:│.*│|├.*┤)$/);
		}
		assert.match(medium, /claude-sonnet-4/);
		assert.match(medium, /high/);
		assert.match(medium, /\/tmp\/pi/);
		assert.match(medium, /Quick actions/);
		assert.match(
			medium,
			width >= 40 ? /Type \/ to browse commands/ : /Type \/ to browse/,
		);
		assert.match(medium, /\/model/);
		assert.match(medium, /\/skill:review/);
		assert.doesNotMatch(medium, /Select model|Review changes/);
		assert.doesNotMatch(medium, /\/tree|\/hotkeys/);
	}

	const veryNarrow = renderDashboard(plainTheme, dashboard, 23);
	assert.equal(veryNarrow.length, 1);
	assert.match(veryNarrow[0] ?? "", /Pi v0.84.1/);
	assert.doesNotMatch(veryNarrow[0] ?? "", /claude-sonnet-4|╭|╰/);
});

test("wide dashboard hero is an exact centered nine-row identity and location composition", () => {
	const dashboard = sampleDashboardData();
	const width = 27;
	const rows = renderWideDashboardHero(
		plainTheme,
		dashboard,
		width,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	);
	const expectedLogo = renderDashboardLogo(
		plainTheme,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	).map((row) => centerDashboardText(row, width));

	assert.equal(rows.length, 9);
	assert.equal(rows[0], " ".repeat(width));
	assert.deepEqual(rows.slice(1, 5), expectedLogo);
	assert.equal(rows[5], " ".repeat(width));
	assert.equal(
		rows[6],
		centerDashboardText("claude-sonnet-4 · high", width),
	);
	assert.equal(
		rows[7],
		centerDashboardText("/tmp/pi-dashboard", width),
	);
	assert.equal(rows[8], " ".repeat(width));
	assert.ok(rows.every((row) => visibleWidth(row) === width));
	assert.doesNotMatch(
		stripTerminalSequences(rows.join("\n")),
		/Ship animated header|Untitled session/,
	);

	const full = renderWideDashboardHero(
		plainTheme,
		dashboard,
		38,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	);
	assert.equal(
		full[6],
		centerDashboardText("anthropic/claude-sonnet-4 · think high", 38),
	);
	assert.equal(full[7], centerDashboardText("/tmp/pi-dashboard", 38));

	const unavailable = renderWideDashboardHero(
		plainTheme,
		{ ...dashboard, model: undefined },
		width,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	);
	assert.equal(
		unavailable[6],
		centerDashboardText("Model unavailable · high", width),
	);

	const ansiTheme = {
		...plainTheme,
		fg: (_color: string, text: string) => `\x1b[35m${text}\x1b[0m`,
	} as unknown as ShellTheme;
	const long = renderWideDashboardHero(
		ansiTheme,
		{
			...dashboard,
			model: {
				provider: `provider-${"p".repeat(80)}\x07`,
				id: `\x1b[2Jmodel-${"m".repeat(80)}`,
			},
			cwd: `/tmp/${"nested/".repeat(30)}dashboard\x07`,
		},
		19,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	);
	assert.equal(long.length, 9);
	assert.ok(long.every((row) => visibleWidth(row) === 19));
	assert.match(stripTerminalSequences(long[6] ?? ""), /…/);
	assert.match(stripTerminalSequences(long[7] ?? ""), /…/);
	const longStripped = stripTerminalSequences(long.join("\n"));
	assert.equal(longStripped.includes("\x1b[2J"), false);
	assert.equal(longStripped.includes("\x07"), false);
});

test("wide dashboard integrates exact hero and grid sidebar rows at 110+", () => {
	const width = 120;
	const dashboard = sampleDashboardData();
	const lines = renderDashboard(plainTheme, dashboard, width);
	const columns = calculateDashboardColumns(width - 4);
	const body = lines.slice(1, -1).map((line) =>
		dashboardWideColumns(line, width),
	);
	const expectedHero = renderWideDashboardHero(
		plainTheme,
		dashboard,
		columns.left,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	).map(stripTerminalSequences);
	const expectedSidebar = renderGridWideDashboardSidebar(
		plainTheme,
		dashboard,
		columns.sidebar,
	).map(stripTerminalSequences);

	assert.equal(lines.length, 11);
	assert.deepEqual(
		body.map(({ left }) => left),
		expectedHero,
	);
	assert.deepEqual(body.map(({ right }) => right), expectedSidebar);
	assert.ok(body.every(({ left }) => visibleWidth(left) === columns.left));
	assert.ok(body.every(({ divider }) => divider === "│"));
	assert.ok(body.every(({ right }) => visibleWidth(right) === columns.sidebar));

	const sidebar = body.map(({ right }) => right).join("\n");
	assert.doesNotMatch(sidebar, /anthropic|Thinking|\/tmp\/pi-dashboard/);
	assert.match(sidebar, /Quick actions/);
	assert.match(sidebar, /Type \/ to browse commands/);
	assert.match(sidebar, /Commands/);
	assert.match(sidebar, /\/model.*Select model/);
	assert.match(sidebar, /\/hotkeys.*Show shortcuts/);
	assert.equal((sidebar.match(/ │ /g) ?? []).length, 3);
	const hero = body.map(({ left }) => left).join("\n");
	assert.match(hero, /claude-sonnet-4 · think high/);
	assert.match(hero, /\/tmp\/pi-dashboard/);
	assert.doesNotMatch(hero, /Ship animated header|Untitled session/);
});

test("wide layout sanitizes and truncates styled hero and sidebar metadata", () => {
	const ansiTheme = {
		...plainTheme,
		fg: (_color: string, text: string) => `\x1b[35m${text}\x1b[0m`,
	} as unknown as ShellTheme;
	const width = 120;
	const columns = calculateDashboardColumns(width - 4);
	const dashboard: DashboardData = {
		...sampleDashboardData(),
		model: {
			provider: `provider-${"p".repeat(80)}\x07`,
			id: `\x1b[2Jmodel-${"m".repeat(80)}`,
		},
		thinkingLevel: "high",
		cwd: `/tmp/${"nested/".repeat(30)}dashboard\x07`,
	};
	const lines = renderDashboard(
		ansiTheme,
		dashboard,
		width,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	);
	const body = lines.slice(1, -1).map((line) =>
		dashboardWideColumns(line, width),
	);
	const expectedHero = renderWideDashboardHero(
		ansiTheme,
		dashboard,
		columns.left,
		DASHBOARD_LOGO_FRAME_COUNT - 1,
	).map(stripTerminalSequences);
	const expectedSidebar = renderGridWideDashboardSidebar(
		ansiTheme,
		dashboard,
		columns.sidebar,
	).map(stripTerminalSequences);

	assert.equal(lines.length, 11);
	assertLinesFit(lines, width);
	assert.deepEqual(body.map(({ left }) => left), expectedHero);
	assert.deepEqual(body.map(({ right }) => right), expectedSidebar);
	assert.ok(body.every(({ left }) => visibleWidth(left) === columns.left));
	assert.ok(body.every(({ right }) => visibleWidth(right) === columns.sidebar));
	assert.match(body[6]?.left ?? "", /…/);
	assert.match(body[7]?.left ?? "", /…/);
	const sidebarText = body
		.map(({ right }) => stripTerminalSequences(right))
		.join("\n");
	assert.doesNotMatch(sidebarText, /provider-|model-|nested/);
	const plain = stripTerminalSequences(lines.join("\n"));
	assert.equal(plain.includes("\x1b[2J"), false);
	assert.equal(plain.includes("\x07"), false);
});

test("dashboard switches from medium to compact wide and grid wide at exact boundaries", () => {
	const dashboard = sampleDashboardData();
	const medium = renderDashboard(plainTheme, dashboard, 89);
	assert.equal(medium.length, 16);
	assert.match(stripTerminalSequences(medium[9] ?? "").trim(), /^├─+┤$/);

	for (const width of [90, 109]) {
		const lines = renderDashboard(plainTheme, dashboard, width);
		const columns = calculateDashboardColumns(width - 4);
		const body = lines.slice(1, -1).map((line) =>
			dashboardWideColumns(line, width),
		);
		assert.equal(lines.length, 11);
		assert.deepEqual(
			body.map(({ left }) => left),
			renderWideDashboardHero(
				plainTheme,
				dashboard,
				columns.left,
				DASHBOARD_LOGO_FRAME_COUNT - 1,
			).map(stripTerminalSequences),
		);
		assert.deepEqual(
			body.map(({ right }) => right),
			renderCompactWideDashboardSidebar(
				plainTheme,
				dashboard,
				columns.sidebar,
			).map(stripTerminalSequences),
		);
		assert.match(body[0]?.right ?? "", /^Quick actions/);
		assert.match(body[1]?.right ?? "", /^Type \/ to browse commands/);
		assert.match(body[2]?.right ?? "", /^Commands/);
		assert.equal(body.map(({ right }) => right).join("\n").includes(" │ "), false);
		assert.ok(body.every(({ divider }) => divider === "│"));
		assertLinesFit(lines, width);
	}

	for (const width of [110, 120, 180]) {
		const lines = renderDashboard(plainTheme, dashboard, width);
		const columns = calculateDashboardColumns(width - 4);
		const body = lines.slice(1, -1).map((line) =>
			dashboardWideColumns(line, width),
		);
		assert.equal(lines.length, 11);
		assert.deepEqual(
			body.map(({ left }) => left),
			renderWideDashboardHero(
				plainTheme,
				dashboard,
				columns.left,
				DASHBOARD_LOGO_FRAME_COUNT - 1,
			).map(stripTerminalSequences),
		);
		assert.deepEqual(
			body.map(({ right }) => right),
			renderGridWideDashboardSidebar(
				plainTheme,
				dashboard,
				columns.sidebar,
			).map(stripTerminalSequences),
		);
		assert.match(body[0]?.right ?? "", /^Quick actions/);
		assert.match(body[1]?.right ?? "", /^Type \/ to browse commands/);
		assert.match(body[2]?.right ?? "", /^─+$/);
		assert.match(body[3]?.right ?? "", /^Commands/);
		assert.equal((body[4]?.right.match(/ │ /g) ?? []).length, 1);
		assert.equal((body[5]?.right.match(/ │ /g) ?? []).length, 1);
		assert.equal((body[6]?.right.match(/ │ /g) ?? []).length, 1);
		assert.ok(body.every(({ divider }) => divider === "│"));
		assertLinesFit(lines, width);
	}
});

test("medium dashboard reuses the centered hero above quick actions", () => {
	const dashboard = sampleDashboardData();

	for (const width of [80, 60, 40, 26]) {
		const innerWidth = width - 4;
		const lines = renderDashboard(
			plainTheme,
			dashboard,
			width,
			DASHBOARD_LOGO_FRAME_COUNT - 1,
		);
		const hero = lines.slice(2, 8).map((line) =>
			dashboardBoxContent(line, width),
		);
		const expectedHero = [
			...renderDashboardLogo(
				plainTheme,
				DASHBOARD_LOGO_FRAME_COUNT - 1,
			).map((row) => centerDashboardText(row, innerWidth)),
			centerDashboardText(
				formatDashboardModelIdentity(
					plainTheme,
					dashboard.model,
					dashboard.thinkingLevel,
					innerWidth,
				),
				innerWidth,
			),
			centerDashboardText(
				formatDashboardDirectory(plainTheme, dashboard.cwd, innerWidth),
				innerWidth,
			),
		].map(stripTerminalSequences);

		assert.equal(lines.length, 16);
		assert.deepEqual(hero, expectedHero);
		assert.ok(hero.every((row) => visibleWidth(row) === innerWidth));
		assert.equal(
			dashboardBoxContent(lines[1] ?? "", width),
			" ".repeat(innerWidth),
		);
		assert.equal(
			dashboardBoxContent(lines[8] ?? "", width),
			" ".repeat(innerWidth),
		);
		assert.match(stripTerminalSequences(lines[9] ?? "").trim(), /^├─+┤$/);
		assertLinesFit(lines, width);

		const actions = stripTerminalSequences(lines.slice(10, -1).join("\n"));
		assert.match(actions, /Quick actions/);
		assert.match(actions, /Type \/ to browse/);
		assert.match(actions, /Commands/);
		assert.match(actions, /\/model/);
		assert.match(actions, /\/skill:review/);
		assert.doesNotMatch(actions, /Select model|Review changes/);
		assert.doesNotMatch(actions, /\/tree|\/hotkeys/);
	}
});

test("dashboard renders distinct loading and empty command states", () => {
	const loading = renderDashboard(
		plainTheme,
		{
			...sampleDashboardData(),
			commands: [],
			commandsLoading: true,
		},
		120,
	).join("\n");
	assert.match(loading, /Commands/);
	assert.match(loading, /Discovering commands…/);
	assert.match(loading, /Type \/ to browse commands/);
	assert.doesNotMatch(loading, /No suggestions yet/);

	const empty = renderDashboard(
		plainTheme,
		{
			...sampleDashboardData(),
			commands: [],
			commandsLoading: false,
		},
		40,
	).join("\n");
	assert.match(empty, /Commands/);
	assert.match(empty, /No suggestions yet/);
	assert.match(empty, /Type \/ to browse commands/);
	assert.doesNotMatch(empty, /Discovering commands/);

	const mediumLoading = renderDashboard(
		plainTheme,
		{
			...sampleDashboardData(),
			commands: [],
			commandsLoading: true,
		},
		80,
	);
	assertLinesFit(mediumLoading, 80);
	assert.match(mediumLoading.join("\n"), /Discovering commands…/);
	assert.doesNotMatch(mediumLoading.join("\n"), /No suggestions yet/);
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

test("command sampling defaults to six, is deterministic, and does not mutate the pool", () => {
	const commands = [
		"one",
		"two",
		"three",
		"four",
		"five",
		"six",
		"seven",
		"eight",
	].map((name) => ({
		name,
		description: `Run ${name}`,
	}));
	const values = [0.8, 0.1, 0.6, 0.2, 0.9, 0.4];
	const sample = () => {
		let index = 0;
		return sampleDashboardCommands(
			commands,
			undefined,
			() => values[index++] ?? 0,
		);
	};
	const first = sample();
	const second = sample();
	assert.deepEqual(second, first);
	assert.equal(first.length, 6);
	assert.equal(new Set(first.map((command) => command.name)).size, 6);
	assert.deepEqual(
		commands.map((command) => command.name),
		["one", "two", "three", "four", "five", "six", "seven", "eight"],
	);
});

test("dashboard component cache tracks every display input", () => {
	const data = sampleDashboardData();
	const fake = createFakeDashboardTimers();
	const component = createDashboardComponent(
		plainTheme,
		() => data,
		() => {},
		fake.timers,
	);
	let previous = component.render(120);
	assert.strictEqual(component.render(120), previous);

	const mutations: Array<() => void> = [
		() => {
			data.version = "test";
		},
		() => {
			data.model = { provider: "openai", id: "gpt-test" };
		},
		() => {
			data.thinkingLevel = "low";
		},
		() => {
			data.cwd = "/tmp/renamed";
		},
		() => {
			data.commandsLoading = true;
		},
		() => {
			data.commands[0] = { name: "model", description: "Switch model" };
		},
		() => {
			data.commands.push({ name: "tree:all", description: "Show all" });
		},
	];
	for (const mutate of mutations) {
		mutate();
		const changed = component.render(120);
		assert.notStrictEqual(changed, previous);
		previous = changed;
	}

	component.invalidate();
	assert.notStrictEqual(component.render(120), previous);
	component.dispose?.();
});

test("dashboard component animates once, requests renders, and stops on accent", () => {
	const data = sampleDashboardData();
	const fake = createFakeDashboardTimers();
	let renderRequests = 0;
	const component = createDashboardComponent(
		plainTheme,
		() => data,
		() => {
			renderRequests += 1;
		},
		fake.timers,
	);
	assert.equal(fake.activeCount, 1);
	assert.equal(DASHBOARD_ANIMATION_INTERVAL_MS, 180);
	assert.deepEqual(fake.delays, [180]);

	const initial = component.render(120);
	const initialBlocks = (initial.join("\n").match(/█/g) ?? []).length;
	const commandOrder = data.commands.map(({ name }) => name);

	for (let frame = 1; frame < DASHBOARD_LOGO_FRAME_COUNT; frame += 1) {
		const before = component.render(120);
		fake.advance();
		assert.equal(renderRequests, frame);
		const after = component.render(120);
		assert.notStrictEqual(after, before);
		assert.deepEqual(
			data.commands.map(({ name }) => name),
			commandOrder,
		);
	}

	const final = component.render(120);
	const finalBlocks = (final.join("\n").match(/█/g) ?? []).length;
	assert.ok(finalBlocks > initialBlocks);
	assert.equal(renderRequests, 7);
	assert.equal(fake.activeCount, 0);
	assert.equal(fake.clearCount, 1);

	fake.advance();
	assert.equal(renderRequests, 7);
	assert.strictEqual(component.render(120), final);
	component.dispose?.();
	component.dispose?.();
	assert.equal(fake.clearCount, 1);
});

test("disposing a dashboard component early prevents later animation", () => {
	const fake = createFakeDashboardTimers();
	let renderRequests = 0;
	const component = createDashboardComponent(
		plainTheme,
		sampleDashboardData,
		() => {
			renderRequests += 1;
		},
		fake.timers,
	);
	const initial = component.render(120);
	component.dispose?.();
	component.dispose?.();
	assert.equal(fake.activeCount, 0);
	assert.equal(fake.clearCount, 1);

	fake.advance();
	assert.equal(renderRequests, 0);
	assert.strictEqual(component.render(120), initial);
});

test("metadata, resize, and theme rerenders do not replay the settled animation", () => {
	const data = sampleDashboardData();
	const fake = createFakeDashboardTimers();
	let ansiColor = "\x1b[35m";
	const dynamicTheme = {
		...plainTheme,
		fg: (_color: string, text: string) => `${ansiColor}${text}\x1b[0m`,
	} as unknown as ShellTheme;
	const component = createDashboardComponent(
		dynamicTheme,
		() => data,
		() => {},
		fake.timers,
	);
	for (let frame = 1; frame < DASHBOARD_LOGO_FRAME_COUNT; frame += 1) {
		fake.advance();
	}
	const commandOrder = data.commands.map(({ name }) => name);
	const settled = component.render(80);
	assert.equal(fake.activeCount, 0);
	assert.equal(fake.clearCount, 1);

	data.cwd = "/tmp/updated-without-replay";
	assert.notStrictEqual(component.render(80), settled);
	const resized = component.render(40);
	ansiColor = "\x1b[36m";
	component.invalidate();
	const rethemed = component.render(40);

	assert.notStrictEqual(rethemed, resized);
	assert.equal(fake.activeCount, 0);
	assert.equal(fake.clearCount, 1);
	assert.deepEqual(
		data.commands.map(({ name }) => name),
		commandOrder,
	);
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

test("extension rerenders live model, thinking, and cwd metadata without session text", () => {
	const harness = createDashboardHarness();
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start", reason: "startup" },
		harness.ctx,
	);
	const mounted = harness.mountHeader();
	assert.equal(harness.timers.activeCount, 1);
	const initial = harness.renderHeader(120).join("\n");
	assert.match(initial, /claude-sonnet-4 · think high/);
	assert.doesNotMatch(initial, /Untitled session/);

	// Session renames still request a render, but no rendered line changes.
	harness.resetRequestRenderCount();
	harness.setSessionName("Renamed session");
	const beforeRename = harness.renderHeader(120).join("\n");
	emit(
		harness.handlers,
		"session_info_changed",
		{ type: "session_info_changed", name: "Renamed session" },
		harness.ctx,
	);
	assert.equal(harness.getRequestRenderCount(), 1);
	assert.strictEqual(harness.getHeader(), mounted);
	assert.equal(harness.renderHeader(120).join("\n"), beforeRename);
	assert.doesNotMatch(beforeRename, /Renamed session/);

	harness.setModel("openai", "gpt-test");
	emit(
		harness.handlers,
		"model_select",
		{ type: "model_select", model: { provider: "openai", id: "gpt-test" } },
		harness.ctx,
	);
	assert.equal(harness.getRequestRenderCount(), 2);
	assert.match(
		harness.renderHeader(120).join("\n"),
		/openai\/gpt-test · think high/,
	);

	harness.setThinkingLevel("low");
	emit(
		harness.handlers,
		"thinking_level_select",
		{ type: "thinking_level_select", level: "low" },
		harness.ctx,
	);
	assert.equal(harness.getRequestRenderCount(), 3);
	assert.match(harness.renderHeader(120).join("\n"), /gpt-test · think low/);

	harness.setCwd("/tmp/renamed-dashboard");
	assert.match(harness.renderHeader(120).join("\n"), /\/tmp\/renamed-dashboard/);
	assert.strictEqual(harness.getHeader(), mounted);

	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
	assert.equal(harness.timers.activeCount, 0);
});

test("extension disposes replaced and shut down dashboard components", () => {
	const harness = createDashboardHarness();
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start", reason: "startup" },
		harness.ctx,
	);
	const first = harness.mountHeader();
	assert.equal(harness.timers.activeCount, 1);

	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start", reason: "reload" },
		harness.ctx,
	);
	assert.equal(harness.timers.activeCount, 0);
	const replacement = harness.mountHeader();
	assert.notStrictEqual(replacement, first);
	assert.equal(harness.timers.activeCount, 1);

	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
	assert.equal(harness.timers.activeCount, 0);
	assert.equal(harness.timers.clearCount, 2);
});

test("non-TUI sessions install neither dashboard resources nor timers", () => {
	const harness = createDashboardHarness();
	harness.setMode("rpc");
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start", reason: "startup" },
		harness.ctx,
	);
	assert.equal(harness.hasHeaderFactory(), false);
	assert.equal(harness.hasAutocompleteProvider(), false);
	assert.equal(harness.timers.activeCount, 0);
});

test("stale command discovery cannot update a newer dashboard generation", async () => {
	const harness = createDashboardHarness();
	let staleSignal: AbortSignal | undefined;
	let resolveStale:
		| ((value: { items: AutocompleteItem[]; prefix: string }) => void)
		| undefined;
	const staleProvider = {
		getSuggestions(
			_lines: string[],
			_cursorLine: number,
			_cursorCol: number,
			context: { signal: AbortSignal },
		) {
			staleSignal = context.signal;
			return new Promise<{ items: AutocompleteItem[]; prefix: string }>(
				(resolve) => {
					resolveStale = resolve;
				},
			);
		},
		applyCompletion(lines: string[], cursorLine: number, cursorCol: number) {
			return { lines, cursorLine, cursorCol };
		},
	} as AutocompleteProvider;

	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start", reason: "startup" },
		harness.ctx,
	);
	harness.mountHeader();
	harness.applyAutocompleteProvider(staleProvider);
	assert.equal(staleSignal?.aborted, false);

	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start", reason: "reload" },
		harness.ctx,
	);
	assert.equal(staleSignal?.aborted, true);
	harness.mountHeader();
	harness.applyAutocompleteProvider(
		createCommandProvider([
			{ value: "fresh", label: "fresh", description: "Current generation" },
		]),
	);
	await Promise.resolve();
	await Promise.resolve();
	assert.match(harness.renderHeader(120).join("\n"), /\/fresh/);

	resolveStale?.({
		items: [{ value: "stale", label: "stale", description: "Old generation" }],
		prefix: "/",
	});
	await Promise.resolve();
	await Promise.resolve();
	const rendered = harness.renderHeader(120).join("\n");
	assert.match(rendered, /\/fresh/);
	assert.doesNotMatch(rendered, /\/stale/);

	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
});

test("shutdown aborts pending discovery and ignores late completion", async () => {
	const harness = createDashboardHarness();
	let discoverySignal: AbortSignal | undefined;
	let resolveDiscovery:
		| ((value: { items: AutocompleteItem[]; prefix: string }) => void)
		| undefined;
	const provider = {
		getSuggestions(
			_lines: string[],
			_cursorLine: number,
			_cursorCol: number,
			context: { signal: AbortSignal },
		) {
			discoverySignal = context.signal;
			return new Promise<{ items: AutocompleteItem[]; prefix: string }>(
				(resolve) => {
					resolveDiscovery = resolve;
				},
			);
		},
		applyCompletion(lines: string[], cursorLine: number, cursorCol: number) {
			return { lines, cursorLine, cursorCol };
		},
	} as AutocompleteProvider;

	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start", reason: "startup" },
		harness.ctx,
	);
	harness.mountHeader();
	harness.applyAutocompleteProvider(provider);
	harness.resetRequestRenderCount();
	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
	assert.equal(discoverySignal?.aborted, true);
	assert.equal(harness.timers.activeCount, 0);

	resolveDiscovery?.({
		items: [{ value: "late", label: "late", description: "Too late" }],
		prefix: "/",
	});
	await Promise.resolve();
	await Promise.resolve();
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.equal(harness.getRequestRenderCount(), 0);
	assert.doesNotMatch(harness.renderHeader(120).join("\n"), /\/late/);
});

test("command discovery failure is nonfatal and keeps slash guidance", async () => {
	const harness = createDashboardHarness();
	emit(
		harness.handlers,
		"session_start",
		{ type: "session_start", reason: "startup" },
		harness.ctx,
	);
	harness.mountHeader();
	harness.applyAutocompleteProvider({
		async getSuggestions() {
			throw new Error("discovery failed");
		},
		applyCompletion(lines, cursorLine, cursorCol) {
			return { lines, cursorLine, cursorCol };
		},
	});
	await Promise.resolve();
	await Promise.resolve();
	await new Promise<void>((resolve) => setImmediate(resolve));

	const rendered = harness.renderHeader(120).join("\n");
	assert.match(rendered, /Type \/ to browse commands/);
	assert.match(rendered, /No suggestions yet/);
	assert.doesNotMatch(rendered, /discovery failed/);
	emit(
		harness.handlers,
		"session_shutdown",
		{ type: "session_shutdown" },
		harness.ctx,
	);
});
