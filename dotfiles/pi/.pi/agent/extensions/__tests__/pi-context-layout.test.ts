import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { ContextModal, type ContextRow, type ContextSnapshot } from "../pi-context.ts";

const theme = { fg: (_color: string, value: string) => `\x1b[36m${value}\x1b[0m` };
const usage = { tokens: 42_345, window: 200_000, percent: 21.2,
	provenance: "Pi estimate · last accounted request + trailing content (not current wire payload)" };
const path = "/home/peter/.nix-config/dotfiles/pi/.pi/agent/";

function modal(snapshot: ContextSnapshot, columns: number, rows: number): ContextModal {
	return new ContextModal(snapshot, { terminal: { rows }, requestRender: () => {} }, theme, () => {});
}
function renderAt(component: ContextModal, columns: number, rows: number): string[] {
	// Pi passes 90% of the terminal width to the overlay component.
	const width = Math.floor(columns * 0.9);
	const lines = component.render(width);
	assert.ok(lines.length <= Math.min(rows - 2, Math.floor(rows * 0.85)));
	assert.ok(lines.every((line) => visibleWidth(line) <= width));
	return lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));
}
function selectFile(component: ContextModal, index: number): void {
	component.handleInput("j"); // Context files
	component.handleInput("\r"); // Expand
	for (let i = 0; i <= index; i++) component.handleInput("j");
}

test("120x30 gives a 350-character preview its actual wrapped height without an empty pane", () => {
	const preview = `BEGIN ${"界".repeat(170)} END`;
	const component = modal({ rows: [{ group: "System prompt", label: "Effective system prompt",
		preview, estimate: "~90" }], usage }, 120, 30);
	component.handleInput("\r");
	component.handleInput("j");
	const lines = renderAt(component, 120, 30);
	assert.match(lines.join("\n"), /BEGIN/);
	assert.match(lines.join("\n"), /END/);
	assert.doesNotMatch(lines.join("\n"), /\[preview clipped\]/);
	assert.ok(lines.length < 25, "shorter content should not make a full-height pane");
	assert.match(lines.join("\n"), /Estimated context: 42,345 \/ 200,000 tokens ·21\.2%/);
	assert.match(lines.join("\n"), /Last accounted request \+ later content; not the final payload/);
});

test("context bars fill the modal's inner width and scale proportionally on resize", () => {
	for (const percent of [0, 21.2, 50, 100, 150]) {
		const component = modal({ rows: [], usage: { ...usage, percent } }, 120, 30);
		for (const columns of [120, 80, 40]) {
			const lines = renderAt(component, columns, 30);
			const bar = lines.map((line) => /^ *│ ([━─]+) │$/.exec(line)?.[1]).find(Boolean);
			assert.ok(bar, `missing bar at ${columns} columns and ${percent}%`);
			const innerWidth = Math.min(Math.floor(columns * 0.9), 104) - 4;
			assert.equal(visibleWidth(bar), innerWidth);
			assert.equal([...bar].filter((char) => char === "━").length,
				Math.min(innerWidth, Math.round(percent * innerWidth / 100)));
		}
	}
});

test("source filenames lead the list and preview; full selected paths wrap at 120x30 and 40x24", () => {
	const rows: ContextRow[] = ["AGENTS.md", "README.md"].map((name) => ({
		group: "Context files", label: `Context file: ${path}${name} (within prompt)`,
		preview: `Contents of ${name}`, estimate: "~123",
	}));
	for (const [columns, termRows] of [[120, 30], [40, 24]] as const) {
		for (const [index, name] of ["AGENTS.md", "README.md"].entries()) {
			const component = modal({ rows, usage }, columns, termRows);
			selectFile(component, index);
			const lines = renderAt(component, columns, termRows);
			const text = lines.join("\n");
			assert.match(text, new RegExp(`› +${name.replace(".", "\\.")} +~123`));
			// Reassemble wrapped preview rows, excluding list rows and box borders.
			const previewRows = lines.filter((line) => /Context file:|\/home\/peter|\/pi\/|within prompt/.test(line))
				.map((line) => line.split("│").at(-2)?.trim() ?? "");
			assert.ok(previewRows.join("").replace(/\s+/g, "").includes(`${path}${name}`), text);
			assert.match(text, columns === 40 ? /↑↓ · ← · \? · Esc\/q close/ : /↑↓ move · ← collapse · \? help · Esc\/q close/);
			assert.doesNotMatch(text, /Enter toggle/);
		}
	}
});

test("40/60-column footers reserve help and Escape and describe only the selected item's actions", () => {
	const rows: ContextRow[] = [{ group: "Tools", label: "Tool: read", preview: "read", estimate: "~1" }];
	for (const columns of [40, 60]) {
		const component = modal({ rows, usage }, columns, 24);
		const group = renderAt(component, columns, 24).at(-2)!;
		assert.match(group, columns === 40 ? /↑↓ · Enter · \? · Esc\/q close/ : /↑↓ move · Enter toggle · \? help · Esc\/q close/);
		for (let i = 0; i < 3; i++) component.handleInput("j");
		component.handleInput("\r");
		component.handleInput("j");
		const child = renderAt(component, columns, 24).at(-2)!;
		assert.match(child, columns === 40 ? /↑↓ · ← · \? · Esc\/q close/ : /↑↓ move · ← collapse · \? help · Esc\/q close/);
		assert.doesNotMatch(child, /Enter/);
	}
});

test("80x24 keeps all section names with 100+ counts and six-digit estimates", () => {
	const groups: ContextRow["group"][] = ["System prompt", "Context files", "Skills", "Tools", "Conversation"];
	const rows = groups.flatMap((group) => Array.from({ length: 125 }, (_, n) => ({
		group, label: `${group} ${n}`, preview: `content ${n}`, estimate: "~9000",
	})));
	const lines = renderAt(modal({ rows, usage }, 80, 24), 80, 24).join("\n");
	for (const group of groups)
		assert.match(lines, new RegExp(`${group} +125 (?:items · )?~1125000`));
	assert.match(lines, /≈ text code points \/ 4 · prompt, files and skills overlap/);
	const narrow = renderAt(modal({ rows, usage }, 40, 24), 40, 24).join("\n");
	assert.match(narrow, /System prompt +125·~1125000/);
	assert.match(narrow, /≈ tokens · files\/skills overlap/);
});

test("intermediate and tiny heights never present an unqualified percentage", () => {
	const rows: ContextRow[] = [{ group: "System prompt", label: "Effective system prompt",
		preview: "body", estimate: "~1" }];
	for (const termRows of [10, 11, 14, 15, 16, 24]) {
		const lines = renderAt(modal({ rows, usage }, 60, termRows), 60, termRows).join("\n");
		if (termRows > 10) assert.match(lines, /CONTEXT +· +current snapshot/);
		else assert.match(lines, /System prompt.*Effective prompt/s);
		if (lines.includes("21.2%")) assert.match(lines, /Est(?:imated|\.) context:|Est\. 42,345/);
		assert.doesNotMatch(lines, /next.request reconstruction|Pi used\/window: 42,345/);
	}
	const tiny = renderAt(modal({ rows, usage }, 40, 6), 40, 6).join("\n");
	assert.match(tiny, /System prompt.*Effective prompt/s);
	assert.match(tiny, /\? (?:help ·|·) Esc\/q close/);
});

test("help wraps and scrolls within narrow, short and minimal overlay budgets", () => {
	const snapshot = { rows: [], usage };
	for (const columns of [1, 2, 5, 10, 14, 22, 40, 60, 80, 120, 160]) {
		for (const termRows of [1, 2, 3, 4, 6, 8, 9, 10, 12, 24, 30]) {
			const tui = { terminal: { rows: termRows }, requestRender: () => {} };
			const component = new ContextModal(snapshot, tui, theme, () => {});
			// Test even a single available column; the overlay can round its width to zero.
			const width = Math.max(1, Math.floor(columns * 0.9));
			const budget = Math.max(1, Math.min(termRows - 2, Math.floor(termRows * 0.85)));
			const check = () => {
				const lines = component.render(width);
				assert.ok(lines.length <= budget, `${columns}x${termRows}: ${lines.length} > ${budget}`);
				assert.ok(lines.every((line) => visibleWidth(line) <= width), `${columns}x${termRows}`);
				assert.ok(lines.length > 0);
				return lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));
			};
			component.handleInput("?");
			const start = check();
			if (width >= 22 && termRows >= 6) assert.match(start.join("\n"), /\? back · Esc\/q close/);
			for (let i = 0; i < 5; i++) { component.handleInput("\x1b[6~"); check(); }
			for (let i = 0; i < 2000; i++) component.handleInput("j");
			const end = check();
			component.handleInput("j");
			assert.deepEqual(check(), end, "help scrolling clamps at the end");
			for (let i = 0; i < 2000; i++) component.handleInput("k");
			assert.deepEqual(check(), start, "help scrolling clamps at the start");
			component.handleInput("?");
			check();
		}
	}
});

test("help can be read to the end at 40x6 and reflows safely after a resize", () => {
	const tui = { terminal: { rows: 6 }, requestRender: () => {} };
	const component = new ContextModal({ rows: [], usage }, tui, theme, () => {});
	component.handleInput("?");
	const pages: string[] = [];
	for (let i = 0; i < 80; i++) {
		pages.push(renderAt(component, 40, 6).join("\n"));
		component.handleInput("\x1b[6~");
	}
	const text = pages.join("\n");
	assert.match(text, /LOCAL SHORTCUTS/);
	assert.match(text, /PgUp\/PgDn/);
	assert.match(text, /Enter: toggle the selected/);
	assert.match(text, /ABOUT THIS SNAPSHOT/);
	assert.match(text, /not the final payload/);
	// Clamp help's own viewport on resize, without rendering the hidden context view.
	tui.terminal.rows = 30;
	const wide = renderAt(component, 120, 30).join("\n");
	assert.match(wide, /LOCAL SHORTCUTS/);
	assert.match(wide, /not the final payload/);
	tui.terminal.rows = 9;
	for (const width of [1, 14, 36, 104]) {
		const lines = component.render(width);
		assert.ok(lines.length <= 7);
		assert.ok(lines.every((line) => visibleWidth(line) <= width));
	}
});

test("both context views return no lines when the terminal has no rendering space", () => {
	const tui = { terminal: { rows: 24 }, requestRender: () => {} };
	const component = new ContextModal({ rows: [], usage }, tui, theme, () => {});
	for (const help of [false, true]) {
		if (help) component.handleInput("?");
		assert.deepEqual(component.render(0), []);
		assert.deepEqual(component.render(-1), []);
		tui.terminal.rows = 0;
		assert.deepEqual(component.render(40), []);
		tui.terminal.rows = 24;
	}
});
