import assert from "node:assert/strict";
import test from "node:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import {
  applyPanelMargin,
  chooseWidthCandidate,
  formatIdentity,
  formatKeyHint,
  formatMetadata,
  formatState,
  renderPanelBottom,
  renderPanelRow,
  renderPanelTop,
  sanitizeDisplayLine,
  sanitizeDisplayText,
  STATE_PRESENTATIONS,
  type UiTheme,
} from "./ui.ts";

function markerTheme(marker: string): UiTheme {
  const mark = (kind: string, token: string, text: string) =>
    `\x1b]9;${marker}:${kind}:${token}\x07${text}\x1b]9;end\x07`;

  return {
    fg: (token, text) => mark("fg", token, text),
    bg: (token, text) => mark("bg", token, text),
    bold: (text) => mark("style", "bold", text),
  } as UiTheme;
}

test("settled states use the exact glyphs, labels, and semantic foregrounds", () => {
  assert.deepEqual(STATE_PRESENTATIONS, {
    starting: { glyph: "○", label: "starting", token: "accent" },
    running: { glyph: "◌", label: "running", token: "accent" },
    active: { glyph: "●", label: "active", token: "success" },
    waiting: { glyph: "◐", label: "waiting", token: "muted" },
    help: { glyph: "?", label: "needs help", token: "warning" },
    stalled: { glyph: "!", label: "stalled", token: "error" },
    completed: { glyph: "✓", label: "completed", token: "success" },
    failed: { glyph: "✗", label: "failed", token: "error" },
  });

  const theme = markerTheme("state");
  for (const [state, presentation] of Object.entries(STATE_PRESENTATIONS)) {
    const rendered = formatState(theme, state as keyof typeof STATE_PRESENTATIONS);
    assert.match(rendered, new RegExp(`state:fg:${presentation.token}`));
    assert.equal(sanitizeDisplayLine(rendered), `${presentation.glyph} ${presentation.label}`);
  }
});

test("display sanitizers remove terminal behavior and preserve line structure", () => {
  const unsafe = [
    "\x1b[31mred\x1b[0m",
    "\x1b]8;;https://evil.example\x07linked\x1b]8;;\x07",
    "move\x1b[2A\x00\x07done",
    "emoji 👩🏽‍💻 and 漢字",
  ].join("\n");

  const sanitized = sanitizeDisplayText(unsafe);
  assert.equal(sanitized.split("\n").length, unsafe.split("\n").length);
  assert.equal(
    sanitized,
    ["red", "linked", "move done", "emoji 👩🏽‍💻 and 漢字"].join("\n"),
  );
  assert.doesNotMatch(sanitized, /[\x00-\x09\x0b-\x1f\x7f]/);
  assert.equal(sanitizeDisplayLine("first\nsecond\rthird"), "first second third");
});

test("display sanitizers neutralize C1 CSI, OSC, DCS, ST, and NEL controls", () => {
  const unsafe = [
    "csi\u009b31mred\u009b0m",
    "osc\u009d8;;https://evil.example\u009clinked",
    "dcs\u0090payload\u009cend",
    "nel\u0085same line",
  ].join("\n");

  const sanitized = sanitizeDisplayText(unsafe);
  assert.equal(sanitized.split("\n").length, unsafe.split("\n").length);
  assert.doesNotMatch(sanitized, /[\u0080-\u009f]/u);
  assert.doesNotMatch(sanitizeDisplayLine(unsafe), /[\u0080-\u009f]/u);
  assert.match(sanitized, /red/);
  assert.match(sanitized, /linked/);
  assert.match(sanitized, /payload/);
  assert.match(sanitized, /same line/);
});

test("semantic identity, metadata, and key hints request their settled tokens", () => {
  const theme = markerTheme("helpers");
  assert.match(formatIdentity(theme, "Worker", "scout"), /helpers:fg:toolTitle/);
  assert.match(formatIdentity(theme, "Worker", "scout"), /helpers:fg:dim/);
  assert.match(formatMetadata(theme, "12s"), /helpers:fg:muted/);
  assert.match(formatKeyHint(theme, "Ctrl+J", "expand"), /helpers:fg:dim/);
  assert.doesNotMatch(
    formatIdentity(theme, "\x1b[31mBad\x1b[0m", "\x1b]8;;x\x07role\x1b]8;;\x07"),
    /\x1b\[31m|helpers:fg:error/,
  );
});

test("width candidates select in priority order and truncate only as a fallback", () => {
  assert.equal(chooseWidthCandidate(["full", "mid", "x"], 4), "full");
  assert.equal(chooseWidthCandidate(["too wide", "mid", "x"], 4), "mid");
  assert.equal(
    stripTerminalSequences(chooseWidthCandidate(["too wide", "still wide"], 2)),
    "st",
  );
  assert.equal(chooseWidthCandidate(["x"], 0), "");
  assert.equal(
    stripTerminalSequences(chooseWidthCandidate(["👩🏽‍💻x"], 2)),
    "👩🏽‍💻",
  );
});

test("transparent panel and margin helpers never exceed the requested width", () => {
  const theme = markerTheme("panel");
  const widths = [0, 1, 2, 16, 24, 40, 80];

  for (const width of widths) {
    const panel = [
      renderPanelTop(theme, width, "Subagents", "2 running"),
      renderPanelRow(
        theme,
        width,
        `${formatIdentity(theme, "A very long Unicode 👩🏽‍💻 worker", "scout")} ${formatState(theme, "active")}`,
      ),
      renderPanelBottom(theme, width),
    ];
    const margined = applyPanelMargin(panel, width);

    for (const line of [...panel, ...margined]) {
      assert.ok(
        visibleWidth(line) <= width,
        `expected ${JSON.stringify(line)} to fit ${width} columns`,
      );
      assert.doesNotMatch(line, /panel:bg:/);
    }
  }
});

test("panel helpers style live from the supplied theme", () => {
  const first = renderPanelTop(markerTheme("first"), 24, "Subagents", "2");
  const second = renderPanelTop(markerTheme("second"), 24, "Subagents", "2");
  assert.match(first, /first:fg:accent/);
  assert.doesNotMatch(first, /second:/);
  assert.match(second, /second:fg:accent/);
  assert.doesNotMatch(second, /first:/);
});
