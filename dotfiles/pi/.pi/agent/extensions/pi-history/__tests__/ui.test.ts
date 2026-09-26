import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	stripTerminalSequences,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	applyPanelMargin,
	formatKeyHint,
	formatMetadata,
	formatSavedCount,
	formatSeparator,
	padToWidth,
	renderPanelBottom,
	renderPanelDivider,
	renderPanelRow,
	renderPanelTop,
	selectedRowText,
} from "../ui.ts";

type ThemeCall =
	| { kind: "fg"; token: string; text: string }
	| { kind: "bg"; token: string; text: string }
	| { kind: "bold"; text: string };

function recordingTheme(
	palette = { fg: 36, bg: 44, bold: 1 },
): { theme: Theme; calls: ThemeCall[] } {
	const calls: ThemeCall[] = [];
	return {
		theme: {
			fg(token: string, text: string) {
				calls.push({ kind: "fg", token, text });
				return `\u001b[${palette.fg}m${text}\u001b[39m`;
			},
			bg(token: string, text: string) {
				calls.push({ kind: "bg", token, text });
				return `\u001b[${palette.bg}m${text}\u001b[49m`;
			},
			bold(text: string) {
				calls.push({ kind: "bold", text });
				return `\u001b[${palette.bold}m${text}\u001b[22m`;
			},
		} as unknown as Theme,
		calls,
	};
}

function panel(theme: Theme, width: number): string[] {
	const panelWidth = Math.max(0, width - 2);
	return applyPanelMargin(
		[
			renderPanelTop(
				theme,
				panelWidth,
				"Prompt stash",
				formatSavedCount(2),
			),
			renderPanelRow(
				theme,
				panelWidth,
				`${formatMetadata(theme, "世界")} ${formatSeparator(theme)} ${formatKeyHint(theme, "Ctrl+N", "move")}`,
			),
			renderPanelDivider(theme, panelWidth),
			renderPanelBottom(theme, panelWidth),
		],
		width,
	);
}

test("panel primitives use semantic tokens and transparent rows", () => {
	const { theme, calls } = recordingTheme();
	const lines = panel(theme, 50);

	assert.ok(
		calls.some(
			(call) => call.kind === "fg" && call.token === "borderMuted",
		),
	);
	assert.ok(
		calls.some((call) => call.kind === "fg" && call.token === "accent"),
	);
	assert.ok(
		calls.some((call) => call.kind === "fg" && call.token === "muted"),
	);
	assert.ok(calls.some((call) => call.kind === "fg" && call.token === "dim"));
	assert.ok(calls.some((call) => call.kind === "bold"));
	assert.equal(calls.some((call) => call.kind === "bg"), false);

	const plain = lines.map(stripTerminalSequences);
	assert.match(plain[0] ?? "", /^ ╭.*Prompt stash.*2 saved.*╮ $/);
	assert.match(plain[1] ?? "", /^ │.*世界.*Ctrl\+N move.*│ $/);
	assert.match(plain[2] ?? "", /^ ├─+┤ $/);
	assert.match(plain[3] ?? "", /^ ╰─+╯ $/);
});

test("saved counts normalize invalid values for shared widget and picker copy", () => {
	assert.equal(formatSavedCount(1), "1 saved");
	assert.equal(formatSavedCount(3.9), "3 saved");
	assert.equal(formatSavedCount(-1), "0 saved");
	assert.equal(formatSavedCount(Number.NaN), "0 saved");
});

test("selected rows use readable semantic foreground and background", () => {
	const { theme, calls } = recordingTheme();
	const selected = selectedRowText(theme, "chosen");

	assert.equal(stripTerminalSequences(selected), "chosen");
	assert.deepEqual(
		calls.map((call) =>
			call.kind === "bold"
				? call.kind
				: `${call.kind}:${call.token}`,
		),
		["fg:text", "bg:selectedBg"],
	);
});

test("panels keep one-column transparent margins and fit every supplied width", () => {
	const { theme } = recordingTheme();
	for (const width of [0, 1, 2, 3, 8, 19, 80]) {
		const lines = panel(theme, width);
		for (const line of lines) {
			assert.ok(
				visibleWidth(line) <= width,
				`${visibleWidth(line)} exceeds ${width}: ${line}`,
			);
		}
		if (width >= 3) {
			for (const line of lines) {
				const plain = stripTerminalSequences(line);
				if (!plain) continue;
				assert.equal(plain[0], " ");
				assert.equal(plain.at(-1), " ");
			}
		}
	}
});

test("padding and truncation use visible width for Unicode and ANSI text", () => {
	const styled = "\u001b[31m界🙂abcdef\u001b[39m";
	for (const width of [0, 1, 2, 3, 4, 7]) {
		const fitted = padToWidth(styled, width);
		assert.equal(visibleWidth(fitted), width);
	}

	const { theme } = recordingTheme();
	for (const width of [0, 1, 2, 3, 4, 7, 16]) {
		for (const line of panel(theme, width)) {
			assert.ok(visibleWidth(line) <= width);
		}
	}
});

test("rendering with a new live theme does not reuse stale themed output", () => {
	const first = recordingTheme({ fg: 31, bg: 41, bold: 1 }).theme;
	const second = recordingTheme({ fg: 32, bg: 42, bold: 2 }).theme;

	const oldLines = panel(first, 40);
	const newLines = panel(second, 40);

	assert.notDeepEqual(newLines, oldLines);
	assert.ok(oldLines.some((line) => line.includes("\u001b[31m")));
	assert.ok(newLines.some((line) => line.includes("\u001b[32m")));
});
