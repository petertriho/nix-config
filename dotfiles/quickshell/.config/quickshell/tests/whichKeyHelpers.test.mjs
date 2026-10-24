// Tests for modules/WhichKey/whichKeyHelpers.js.
// Run from the quickshell directory: node --test tests/*.test.mjs
//
// fixtures/which-key-binds.json is a copy of the bind file that
// home/programs/niri.nix writes. It does not follow later bind changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../modules/WhichKey/whichKeyHelpers.js", import.meta.url),
  "utf8",
);
const helpers = vm.createContext({});
vm.runInContext(source, helpers);

const plain = (value) => JSON.parse(JSON.stringify(value));

const fixture = JSON.parse(
  readFileSync(new URL("fixtures/which-key-binds.json", import.meta.url), "utf8"),
);
const view = plain(helpers.parseBindFile(fixture));
const layers = view.layers;

function row(layer, label) {
  return layers[layer].find((r) => r.label === label);
}

test("layer names are canonical", () => {
  assert.deepEqual(Object.keys(layers).sort(), [
    "Mod",
    "Mod+Alt",
    "Mod+Alt+Ctrl",
    "Mod+Alt+Ctrl+Shift",
    "Mod+Alt+Shift",
    "Mod+Ctrl",
    "Mod+Ctrl+Shift",
    "Mod+Shift",
  ]);
  assert.equal(helpers.canonicalLayer("Mod+Shift+Alt"), "Mod+Alt+Shift");
  assert.equal(helpers.canonicalLayer("shift+mod+CTRL"), "Mod+Ctrl+Shift");
  assert.equal(helpers.canonicalLayer("Super+Alt"), "Mod+Alt");
  assert.equal(helpers.canonicalLayer("Ctrl+Shift"), "");
  assert.equal(helpers.canonicalLayer("Mod+ISO_Level3_Shift"), "");
  assert.equal(helpers.canonicalLayer(""), "");
});

test("the layer of a reader state follows the held modifiers", () => {
  assert.equal(helpers.layerName({ mod: true }), "Mod");
  assert.equal(
    helpers.layerName({ mod: true, shift: true, ctrl: true }),
    "Mod+Ctrl+Shift",
  );
  assert.equal(
    helpers.layerName({ mod: true, alt: true, ctrl: true, shift: true }),
    "Mod+Alt+Ctrl+Shift",
  );
  assert.equal(helpers.layerName({ mod: false, shift: true }), "");
  assert.equal(helpers.layerName(null), "");
});

test("the Mod layer is compact", () => {
  assert.equal(layers.Mod.length, 25);
  assert.equal(layers["Mod+Shift"].length, 12);
  assert.equal(layers["Mod+Alt"].length, 2);
});

test("digit runs merge into one row", () => {
  assert.deepEqual(row("Mod", "1…0"), {
    label: "1…0",
    title: "Focus Workspace 1–10",
  });
  // A scalar argument (move-column-to-workspace = 1).
  assert.equal(row("Mod+Ctrl", "1…0").title, "Move Column to Workspace 1–10");
  // An options object before the number.
  assert.equal(row("Mod+Shift", "1…0").title, "Move Window to Workspace 1–10");
  assert.equal(
    layers.Mod.some((r) => /^[0-9]$/.test(r.label)),
    false,
  );
});

test("a digit run with a gap does not merge", () => {
  const rows = plain(
    helpers.compactLayer([
      { key: "1", entry: { key: "Mod+1", action: { "focus-workspace": [1] } } },
      { key: "3", entry: { key: "Mod+3", action: { "focus-workspace": [3] } } },
    ]),
  );
  assert.deepEqual(rows, [
    { label: "1", title: "Focus Workspace 1" },
    { label: "3", title: "Focus Workspace 3" },
  ]);
});

function bind(key, action, title = null) {
  return { key: key, entry: { key: "Mod+" + key, action: action, title: title } };
}

test("keys with the same action share a row", () => {
  const rows = plain(
    helpers.compactLayer([
      bind("Return", { spawn: ["ghostty"] }),
      bind("T", { spawn: ["ghostty"] }),
      bind("WheelScrollDown", { "focus-workspace-down": [] }),
      bind("N", { "focus-workspace-down": [] }),
    ]),
  );
  assert.deepEqual(rows, [
    { label: "n wheel↓", title: "Focus Workspace Down" },
    { label: "t ⏎", title: "Spawn ghostty" },
  ]);
});

test("variants of one action share a row with the primary keys", () => {
  assert.equal(row("Mod", "h/l").title, "Focus Column Left/Right");
  assert.equal(row("Mod", "j/k").title, "Focus Window Down/Up");
  assert.equal(row("Mod", "n/p").title, "Focus Workspace Down/Up");
  assert.equal(row("Mod", "-/=").title, "Set Column Width -10%/+10%");
  assert.equal(row("Mod", "[/]").title, "Consume or Expel Window Left/Right");
  assert.equal(row("Mod+Ctrl", "h/l").title, "Focus Column First/Last");
  assert.deepEqual(layers["Mod+Alt"], [
    { label: "h/j/k/l", title: "Focus Monitor Left/Down/Up/Right" },
    { label: "n/p", title: "Focus Monitor Next/Previous" },
  ]);
  assert.equal(
    row("Mod+Shift", "wheel↓/wheel↑").title,
    "Focus Column Right/Left",
  );
  // The arrow and wheel aliases are left out of grouped rows.
  const labels = layers.Mod.map((r) => r.label).join(" ");
  assert.equal(/[←↓↑→]/.test(labels), false);
});

test("rows of other words or classes stay apart", () => {
  // "Open Terminal" and "Open Browser" are not variants.
  assert.ok(row("Mod", "t"));
  assert.ok(row("Mod", "⏎"));
  // Directions and Next/Previous are two classes.
  assert.equal(layers["Mod+Alt"].length, 2);
  // A repeated variant does not merge.
  const rows = plain(
    helpers.compactLayer([
      bind("H", { "focus-column-left": [] }),
      bind("A", { "focus-column-left": [{ wrap: true }] }),
    ]),
  );
  assert.deepEqual(rows, [
    { label: "a", title: "Focus Column Left" },
    { label: "h", title: "Focus Column Left" },
  ]);
  // A single variant row keeps its aliases.
  assert.deepEqual(
    plain(
      helpers.compactLayer([
        bind("H", { "focus-column-left": [] }),
        bind("Left", { "focus-column-left": [] }),
      ]),
    ),
    [{ label: "h ←", title: "Focus Column Left" }],
  );
});

test("variant words are directions, ends, sequences, and amounts", () => {
  assert.equal(helpers.variantOf("Focus Column Left").word, "Left");
  assert.equal(helpers.variantOf("Focus Column First").word, "First");
  assert.equal(helpers.variantOf("Focus Monitor Previous").word, "Previous");
  assert.equal(helpers.variantOf("Set Column Width -10%").word, "-10%");
  assert.equal(helpers.variantOf("Set Column Width +5").word, "+5");
  assert.equal(helpers.variantOf("Open Terminal"), null);
  assert.equal(helpers.variantOf("Focus Workspace 1–10"), null);
  assert.equal(helpers.variantOf("Left"), null);
  assert.notEqual(
    helpers.variantOf("Focus Monitor Left").group,
    helpers.variantOf("Focus Monitor Next").group,
  );
});

test("titles come from hotkey-overlay.title, then from the action", () => {
  assert.equal(row("Mod", "⏎").title, "Open Terminal");
  assert.equal(
    helpers.titleFor({ action: { "set-column-width": ["-10%"] } }),
    "Set Column Width -10%",
  );
  assert.equal(
    helpers.titleFor({ action: { "consume-or-expel-window-left": [] } }),
    "Consume or Expel Window Left",
  );
  assert.equal(row("Mod", "Esc").title, "Lock Screen");
  assert.equal(
    helpers.titleFor({ action: { spawn: ["loginctl", "lock-session"] } }),
    "Spawn loginctl",
  );
  assert.equal(
    helpers.titleFor({
      action: { spawn: ["sh", "-c", "/run/bin/vicinae vicinae://toggle"] },
    }),
    "Spawn vicinae",
  );
  assert.equal(
    helpers.titleFor({ action: { "spawn-sh": ["playerctl play-pause"] } }),
    "Spawn playerctl",
  );
  assert.equal(
    helpers.titleFor({ action: { screenshot: { "show-pointer": false } } }),
    "Screenshot",
  );
});

test("binds without Mod do not show", () => {
  const labels = Object.values(layers)
    .flat()
    .map((r) => r.label);
  assert.equal(labels.includes("Print"), false);
  assert.equal(
    labels.some((label) => label.startsWith("XF86")),
    false,
  );
});

test("rows sort letters, digits, symbols, then named keys", () => {
  const labels = layers.Mod.map((r) => r.label);
  assert.deepEqual(labels.slice(0, 3), ["b", "c", "f"]);
  assert.ok(labels.indexOf("z") < labels.indexOf("1…0"));
  assert.ok(labels.indexOf("1…0") < labels.indexOf("`"));
  assert.ok(labels.indexOf("/") === -1);
  assert.ok(labels.indexOf(".") < labels.indexOf("Esc"));
  assert.deepEqual(labels.slice(-3), ["Esc", "⏎", "Space"]);
});

test("key labels use symbols", () => {
  assert.equal(helpers.keyLabel("H"), "h");
  assert.equal(helpers.keyLabel("BracketLeft"), "[");
  assert.equal(helpers.keyLabel("comma"), ",");
  assert.equal(helpers.keyLabel("Return"), "⏎");
  assert.equal(helpers.keyLabel("WheelScrollDown"), "wheel↓");
  assert.equal(helpers.keyLabel("XF86AudioMute"), "XF86AudioMute");
});

test("a layer without binds has no rows", () => {
  assert.deepEqual(plain(helpers.rowsFor(layers, "Mod+Foo")), []);
  assert.deepEqual(plain(helpers.rowsFor(layers, "")), []);
  assert.deepEqual(plain(helpers.rowsFor({}, "Mod")), []);
  assert.deepEqual(plain(helpers.buildLayers([])), {});
  assert.deepEqual(plain(helpers.viewRows(view, "")), []);
  assert.deepEqual(plain(helpers.viewRows(null, "Mod")), []);
});

test("hidden binds are not in the bind file", () => {
  // home/programs/niri.nix leaves out binds with hotkey-overlay.hidden, so
  // the helpers only skip broken entries.
  assert.deepEqual(
    plain(helpers.buildLayers([null, { key: "Mod+H" }, { action: {} }])),
    {},
  );
});

test("the bind file gives layers, group labels, and bind counts", () => {
  assert.equal(view.counts.Mod, 47);
  assert.equal(view.counts["Mod+Alt"], 10);
  assert.equal(view.groups["Mod+Alt"], "monitor: focus");
  const parsed = plain(
    helpers.parseBindFile({
      binds: [],
      groups: { "Mod+Shift+Alt": "a", "Ctrl+Shift": "b", "Mod+Ctrl": 3 },
    }),
  );
  assert.deepEqual(parsed.groups, { "Mod+Alt+Shift": "a" });
  assert.deepEqual(plain(helpers.parseBindFile(null)), {
    layers: {},
    groups: {},
    counts: {},
  });
  // A bind list without groups, from an older generation.
  const old = plain(helpers.parseBindFile(fixture.binds));
  assert.equal(old.layers.Mod.length, 25);
  assert.deepEqual(old.groups, {});
});

test("modifier rows come first, with their group labels", () => {
  const rows = plain(helpers.viewRows(view, "Mod"));
  assert.deepEqual(rows.slice(0, 4), [
    { label: "alt", title: "+monitor: focus", isGroup: true },
    { label: "ctrl", title: "+column/workspace", isGroup: true },
    { label: "shift", title: "+move", isGroup: true },
    { label: "b", title: "Toggle Notification Center" },
  ]);
  assert.equal(rows.length, 3 + 25);
  assert.deepEqual(
    plain(helpers.modifierRows(view, "Mod+Alt")).map((r) => r.title),
    ["+monitor: move column", "+monitor: move window"],
  );
  assert.deepEqual(
    plain(helpers.modifierRows(view, "Mod+Ctrl+Shift")).map((r) => r.label),
    ["alt"],
  );
  assert.deepEqual(plain(helpers.modifierRows(view, "Mod+Alt+Ctrl+Shift")), []);
});

test("a modifier without a label shows its bind count", () => {
  const small = plain(
    helpers.parseBindFile({
      binds: [
        { key: "Mod+H", action: { "focus-column-left": [] } },
        { key: "Mod+Alt+Ctrl+H", action: { "focus-monitor-left": [] } },
        { key: "Mod+Alt+Ctrl+L", action: { "focus-monitor-right": [] } },
        { key: "Mod+Shift+H", action: { "move-column-left": [] } },
      ],
      groups: {},
    }),
  );
  // Mod+Alt and Mod+Ctrl have no binds, but they lead to Mod+Alt+Ctrl.
  assert.deepEqual(plain(helpers.modifierRows(small, "Mod")), [
    { label: "alt", title: "+2 binds", isGroup: true },
    { label: "ctrl", title: "+2 binds", isGroup: true },
    { label: "shift", title: "+1 bind", isGroup: true },
  ]);
  assert.deepEqual(plain(helpers.modifierRows(small, "Mod+Shift")), []);
});

test("rows split into columns and grid cells", () => {
  const rows = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), title: "t" + n }));
  assert.deepEqual(
    plain(helpers.columns(rows, 2)).map((c) => c.length),
    [2, 2, 1],
  );
  assert.equal(plain(helpers.columns(rows, 0)).length, 5);
  assert.deepEqual(plain(helpers.columns([], 10)), []);
  assert.deepEqual(plain(helpers.gridCells(rows.slice(0, 1))), [
    { text: "1", isKey: true, isGroup: false },
    { text: "t1", isKey: false, isGroup: false },
  ]);
  assert.deepEqual(
    plain(
      helpers.gridCells([{ label: "alt", title: "+monitor", isGroup: true }]),
    ),
    [
      { text: "alt", isKey: true, isGroup: true },
      { text: "+monitor", isKey: false, isGroup: true },
    ],
  );
});
