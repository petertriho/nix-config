import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  formatTrailer, parseList, parsePull, stateRoot, type ListedAgent, type PulledEvent, type PullRecord,
} from "../cli.ts";
import {
  buildResultContent, EVENT_PRESENTATIONS, registerResultRenderer, renderResultLines, RESULT_TYPE,
} from "../presentation/renderers.ts";
import type { UiTheme } from "../presentation/ui.ts";
import {
  formatSince, renderAgentRow, renderPanelLines, renderWidgetLines, STATUS_PRESENTATIONS,
  summarizeStatuses, type PanelStatus,
} from "../presentation/widget.ts";

const theme = {
  fg: (_token: unknown, text: string) => text,
  bg: (_token: unknown, text: string) => text,
  bold: (text: string) => text,
} as unknown as UiTheme;

const NOW = 1_800_000_000_000;

function agent(overrides: Partial<ListedAgent> = {}): ListedAgent {
  return {
    id: "a1b2c3", name: "api", lead_session: "lead", session: "repo", window: "api", pane: "%5",
    target: "repo:api", cwd: "/work/api", dir: "/state/a1b2c3", status: "working",
    since: NOW / 1000 - 75, turn: 2, message: "", last_text: "", created: 1, ...overrides,
  };
}

function record(event: PulledEvent, overrides: Partial<PullRecord> = {}): PullRecord {
  return {
    id: "a1b2c3", name: "api", event, turn: 4, text: "", message: "", target: "repo:api",
    pane: "%5", cwd: "/work/api", session_file: "/sessions/s.jsonl", ts: 1, screen: "",
    exit_status: "", ...overrides,
  };
}

test("parsePull reads JSON lines and skips bad lines and unknown events", () => {
  const good = JSON.stringify({ ...record("stop", { text: "done" }) });
  const records = parsePull(`${good}\nnot json\n${JSON.stringify({ id: "x", event: "working" })}\n\n`);
  assert.equal(records.length, 1);
  assert.equal(records[0].text, "done");
  assert.equal(records[0].event, "stop");
  assert.deepEqual(parsePull(""), []);
  assert.equal(parsePull(JSON.stringify({ id: "x", event: "gone" }))[0].name, "x", "the name falls back to the id");
});

test("parseList reads the array and drops entries with an unknown status", () => {
  const listed = parseList(JSON.stringify([
    { ...agent(), status: "starting" }, { id: "b", status: "busy" }, null, { ...agent({ id: "c", status: "stopped" }) },
  ]));
  assert.deepEqual(listed.map((entry) => [entry.id, entry.status]), [["a1b2c3", "starting"], ["c", "stopped"]]);
  assert.deepEqual(parseList("pi-tmux-agents: error"), []);
  assert.deepEqual(parseList("{}"), []);
});

test("stateRoot follows the precedence of the CLI", () => {
  assert.equal(stateRoot({ PI_TMUX_AGENTS_STATE_DIR: "/x", XDG_STATE_HOME: "/y" }), "/x");
  assert.equal(stateRoot({ XDG_STATE_HOME: "/y" }), "/y/pi-tmux-agents");
  assert.match(stateRoot({}), /\/\.local\/state\/pi-tmux-agents$/);
});

test("the status mapping uses the pi-subagents states", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(STATUS_PRESENTATIONS).map(([status, p]) => [status, [p.state, p.label]])),
    {
      starting: ["starting", "starting"],
      working: ["running", "working"],
      waiting: ["help", "needs input"],
      idle: ["completed", "idle"],
      error: ["failed", "error"],
      dead: ["stalled", "gone"],
    },
  );
  assert.equal(summarizeStatuses([
    agent(), agent({ id: "b" }), agent({ id: "c", status: "waiting" }), agent({ id: "d", status: "stopped" }),
  ]), "2 working · 1 needs input");
  assert.equal(formatSince(NOW / 1000 - 75, NOW), "01:15");
  assert.equal(formatSince(0, NOW), "00:00");
});

test("panel rows fit the widths 120, 60, 20, and 3", () => {
  const row = agent({ status: "waiting" }) as ListedAgent & { status: PanelStatus };
  assert.equal(renderAgentRow(theme, row, 120, NOW), "01:15 · api (repo:api) · ? needs input");
  assert.equal(renderAgentRow(theme, row, 60, NOW), "01:15 · api (repo:api) · ? needs input");
  assert.equal(renderAgentRow(theme, row, 20, NOW), "api · ? needs input");
  assert.equal(renderAgentRow(theme, row, 3, NOW), "?");
  for (const width of [120, 60, 20, 3]) {
    const lines = renderWidgetLines(theme, [row, agent({ id: "b", name: "web", target: "repo:web" })], width, NOW);
    assert.equal(lines.length, 4, `width ${width}`);
    for (const line of lines) assert.equal(visibleWidth(line), width, `width ${width}: ${line}`);
  }
  const panel = renderPanelLines(theme, [row], 60, NOW);
  assert.match(panel[0], /^╭─ tmux agents ─+ 1 needs input ─╮$/);
  assert.match(panel[1], /^│01:15 · api \(repo:api\) · \? needs input +│$/);
  assert.match(panel[2], /^╰─+╯$/);
});

test("the panel shows nothing when every agent is stopped", () => {
  assert.deepEqual(renderWidgetLines(theme, [agent({ status: "stopped" })], 80, NOW), []);
  assert.deepEqual(renderWidgetLines(theme, [], 80, NOW), []);
});

test("the result content has a headline, the body, and the trailer", () => {
  const content = buildResultContent(record("stop", { text: "All done.\nSHA abc" }));
  assert.equal(content, [
    'pi tmux agent "api" (repo:api) ended turn 4.',
    "",
    "All done.\nSHA abc",
    "",
    "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 turn=4 event=stop",
  ].join("\n"));
  const error = buildResultContent(record("error", { message: "error: rate\nlimited", text: "partial" }));
  assert.match(error, /Error: error: rate\nlimited\n\npartial/);
  assert.match(error, /event=error error=error: rate limited$/);
  const waiting = buildResultContent(record("waiting", { message: "confirm dialog: Go?", screen: "Go?\n→ Yes" }));
  assert.match(waiting, /needs input/);
  assert.match(waiting, /confirm dialog: Go\?.*repo:api.*TmuxAgentInterrupt/s);
  assert.match(waiting, /→ Yes/);
  assert.match(buildResultContent(record("gone", { text: "pi exited with status 1 without a new turn." })), /is gone/);
  assert.match(buildResultContent(record("interrupted")), /The turn was interrupted\./);
  assert.equal(formatTrailer(record("gone")), "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 turn=4 event=gone");
});

test("collapsed and expanded result cards for each event", () => {
  const long = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join("\n");
  const cases: Array<[PulledEvent, Partial<PullRecord>, string]> = [
    ["stop", { text: long }, "✓ api (repo:api) — turn ended (turn 4)"],
    ["error", { message: "length", text: "partial" }, "✗ api (repo:api) — error (turn 4)"],
    ["interrupted", {}, "✗ api (repo:api) — interrupted (turn 4)"],
    ["waiting", { message: "confirm dialog: Go?", screen: "Go?" }, "? api (repo:api) — needs input (turn 4)"],
    ["gone", { text: "The pane is gone without a new turn." }, "! api (repo:api) — gone (turn 4)"],
  ];
  for (const [event, overrides, header] of cases) {
    const collapsed = renderResultLines(record(event, overrides), false, theme, 100, "ctrl+o");
    assert.equal(collapsed[0], header, event);
    assert.equal(collapsed.at(-1), "ctrl+o to expand", event);
    assert.ok(collapsed.length <= 8, `${event}: header, 5 preview lines, count, and hint`);
    const expanded = renderResultLines(record(event, overrides), true, theme, 100, "ctrl+o");
    assert.equal(expanded[0], header, event);
    assert.equal(expanded.at(-2), "Session: /sessions/s.jsonl", event);
    assert.equal(expanded.at(-1), "Resume:  pi-tmux-agents send a1b2c3 ...", event);
  }
  const collapsed = renderResultLines(record("stop", { text: long }), false, theme, 100, "ctrl+o");
  assert.deepEqual(collapsed.slice(1), ["line 1", "line 2", "line 3", "line 4", "line 5", "… 3 more lines", "ctrl+o to expand"]);
  assert.ok(renderResultLines(record("stop", { text: long }), true, theme, 100, "ctrl+o").includes("line 8"));
  assert.equal(EVENT_PRESENTATIONS.stop.bg, "toolSuccessBg");
  assert.equal(EVENT_PRESENTATIONS.error.bg, "toolErrorBg");
  assert.equal(EVENT_PRESENTATIONS.interrupted.bg, "toolErrorBg");
  assert.equal(EVENT_PRESENTATIONS.gone.bg, "toolErrorBg");
  assert.equal(EVENT_PRESENTATIONS.waiting.bg, "customMessageBg");
});

test("the message renderer draws a box with the event background, and strips terminal controls", () => {
  const renderers = new Map<string, Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>();
  registerResultRenderer({
    registerMessageRenderer(name: string, renderer: Parameters<ExtensionAPI["registerMessageRenderer"]>[1]) {
      renderers.set(name, renderer);
    },
  } as unknown as ExtensionAPI);
  const renderer = renderers.get(RESULT_TYPE);
  assert.ok(renderer);
  const backgrounds: string[] = [];
  const boxTheme = { ...theme, bg: (token: string, text: string) => { backgrounds.push(token); return text; } };
  const component = renderer({
    role: "custom", customType: RESULT_TYPE, display: true, timestamp: 1, content: "x",
    details: record("error", { message: "boom", text: "bad\x1b]52;c;Y2xpcA==\x07 output" }),
  }, { expanded: false, outputPad: 1 }, boxTheme as never);
  assert.ok(component);
  const lines = component.render(80);
  assert.equal(lines[0], "");
  assert.ok(backgrounds.every((token) => token === "toolErrorBg"));
  assert.ok(lines.some((line) => line.includes("✗ api (repo:api) — error (turn 4)")));
  assert.ok(lines.every((line) => !line.includes("\x1b]52")), "the OSC 52 sequence must not reach the terminal");
  assert.equal(renderer({ role: "custom", customType: RESULT_TYPE, display: true, timestamp: 1, content: "x" },
    { expanded: false, outputPad: 1 }, boxTheme as never), undefined);
});
