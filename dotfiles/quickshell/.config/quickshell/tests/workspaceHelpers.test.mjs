// Tests for modules/Bar/workspaces/workspaceHelpers.js.
// Run from the quickshell directory: node --test tests/*.test.mjs
//
// The helpers file is a QML JavaScript resource without exports, so it runs
// in a vm context. Its function declarations become properties of the context.
// Objects from the context have another Object prototype, so `plain()` copies
// results before a deep comparison.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../modules/Bar/workspaces/workspaceHelpers.js", import.meta.url),
  "utf8",
);
const helpers = vm.createContext({});
vm.runInContext(source, helpers);

const plain = (value) => JSON.parse(JSON.stringify(value));

const icons = { "com.mitchellh.ghostty": "T", firefox: "F", slack: "S" };
const ignoreClasses = ["xwaylandvideobridge"];

// The fields of `niri msg -j workspaces`.
function workspace(id, idx, output, extra = {}) {
  return {
    id,
    idx,
    name: null,
    output,
    is_active: false,
    is_focused: false,
    is_urgent: false,
    active_window_id: null,
    ...extra,
  };
}

// The fields of `niri msg -j windows`. `pos` is [column, row], or null for a
// floating window.
function window(id, appId, workspaceId, pos, size, extra = {}) {
  return {
    id,
    title: `title ${id}`,
    app_id: appId,
    pid: 1000 + id,
    workspace_id: workspaceId,
    is_focused: false,
    is_floating: pos === null,
    is_urgent: false,
    layout: {
      pos_in_scrolling_layout: pos,
      tile_size: size,
      window_size: size.map(Math.round),
      tile_pos_in_workspace_view: pos === null ? [100.0, 100.0] : null,
      window_offset_in_tile: [0.0, 0.0],
    },
    ...extra,
  };
}

const workspaces = [
  workspace(1, 1, "DP-2", { is_active: true, is_focused: true, active_window_id: 2 }),
  workspace(3, 2, "DP-2"),
  workspace(2, 1, "HDMI-A-1", { is_active: true, active_window_id: 3 }),
  workspace(5, 2, "HDMI-A-1", { name: "web", active_window_id: 21 }),
  workspace(4, 3, "HDMI-A-1"),
];

const windows = [
  window(2, "com.mitchellh.ghostty", 1, [1, 1], [1080.0, 1892.0], { is_focused: true }),
  // Two tiles stacked in column 1, one tile in column 2, one floating window.
  window(3, "firefox", 2, [2, 1], [3072.0, 1700.0]),
  window(10, "com.mitchellh.ghostty", 2, [1, 1], [1536.0, 845.0]),
  window(11, "slack", 2, [1, 2], [1536.0, 845.0]),
  window(12, "firefox", 2, null, [800.0, 600.0]),
  window(13, "xwaylandvideobridge", 2, [3, 1], [1.0, 1.0]),
];

test("capIcons keeps short lists", () => {
  const list = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(plain(helpers.capIcons(list, 5)), { icons: list, hiddenCount: 0 });
});

test("capIcons keeps 5 of 8 icons", () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, focused: false }));
  const result = plain(helpers.capIcons(list, 5));
  assert.deepEqual(result.icons.map((icon) => icon.id), [1, 2, 3, 4, 5]);
  assert.equal(result.hiddenCount, 3);
});

test("capIcons puts a later focused icon in the last slot", () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, focused: id === 7 }));
  const result = plain(helpers.capIcons(list, 5));
  assert.deepEqual(result.icons.map((icon) => icon.id), [1, 2, 3, 4, 7]);
  assert.equal(result.hiddenCount, 3);
});

test("capIcons keeps all icons without a positive max", () => {
  const list = [1, 2, 3].map((id) => ({ id }));
  assert.equal(helpers.capIcons(list, 0).icons.length, 3);
});

test("normalizeNiri gives the workspaces of one output in index order", () => {
  const result = plain(
    helpers.normalizeNiri("HDMI-A-1", workspaces, windows, ignoreClasses, icons, 5),
  );
  assert.deepEqual(result.map((ws) => ws.id), [2, 5, 4]);
  assert.deepEqual(result.map((ws) => ws.idx), [1, 2, 3]);
});

test("normalizeNiri sets the name fields", () => {
  const result = plain(
    helpers.normalizeNiri("HDMI-A-1", workspaces, windows, ignoreClasses, icons, 5),
  );
  const [first, named] = result;
  assert.equal(first.name, "1");
  assert.equal(first.named, false);
  assert.equal(first.reference, "1");
  assert.equal(first.switchTarget, "1");
  assert.equal(named.name, "web");
  assert.equal(named.named, true);
  assert.equal(named.reference, "web");
});

test("normalizeNiri sorts icons by column and row and leaves out ignored apps", () => {
  const [first] = plain(
    helpers.normalizeNiri("HDMI-A-1", workspaces, windows, ignoreClasses, icons, 5),
  );
  assert.deepEqual(first.windowIcons.map((icon) => icon.id), [10, 11, 3, 12]);
  assert.deepEqual(first.windowIcons.map((icon) => icon.icon), ["T", "S", "F", "F"]);
  assert.equal(first.windowIcons.find((icon) => icon.id === 3).focused, true);
  assert.equal(first.windowCount, 4);
  assert.equal(first.hiddenCount, 0);
  assert.equal(first.empty, false);
});

test("normalizeNiri marks empty workspaces", () => {
  const result = plain(
    helpers.normalizeNiri("HDMI-A-1", workspaces, windows, ignoreClasses, icons, 5),
  );
  assert.deepEqual(result.map((ws) => ws.empty), [false, true, true]);
});

test("normalizeNiri counts a workspace with only ignored windows as empty", () => {
  const onlyIgnored = [window(30, "xwaylandvideobridge", 3, [1, 1], [10.0, 10.0])];
  const result = plain(
    helpers.normalizeNiri("DP-2", workspaces, onlyIgnored, ignoreClasses, icons, 5),
  );
  assert.equal(result[1].empty, true);
  assert.equal(result[1].windowCount, 0);
});

test("normalizeNiri makes a workspace urgent for an ignored urgent window", () => {
  const urgentIgnored = [
    window(30, "xwaylandvideobridge", 3, [1, 1], [10.0, 10.0], { is_urgent: true }),
  ];
  const result = plain(
    helpers.normalizeNiri("DP-2", workspaces, urgentIgnored, ignoreClasses, icons, 5),
  );
  assert.equal(result[1].urgent, true);
});

test("normalizeNiri caps the icons", () => {
  const many = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    window(100 + n, "slack", 3, [n, 1], [500.0, 1000.0]),
  );
  const result = plain(helpers.normalizeNiri("DP-2", workspaces, many, ignoreClasses, icons, 5));
  assert.equal(result[1].windowIcons.length, 5);
  assert.equal(result[1].hiddenCount, 2);
  assert.equal(result[1].windowCount, 7);
});

test("normalizeNiri gives nothing without an output name", () => {
  assert.deepEqual(plain(helpers.normalizeNiri("", workspaces, windows, [], icons, 5)), []);
});

const outputHeights = { "DP-2": 2160, "HDMI-A-1": 2160 };

test("isTabbedColumn needs two or more tiles taller than half the output", () => {
  assert.equal(helpers.isTabbedColumn([2000, 2000], 2160), true);
  // Stacked tiles share the column height.
  assert.equal(helpers.isTabbedColumn([1000, 1000], 2160), false);
  assert.equal(helpers.isTabbedColumn([1500, 500], 2160), false);
  assert.equal(helpers.isTabbedColumn([2000], 2160), false);
  assert.equal(helpers.isTabbedColumn([2000, 2000], 0), false);
  assert.equal(helpers.isTabbedColumn([2000, 2000], undefined), false);
});

test("normalizeNiri groups icons by column and keeps floating windows apart", () => {
  const [first] = plain(
    helpers.normalizeNiri("HDMI-A-1", workspaces, windows, ignoreClasses, icons, 5, outputHeights),
  );
  assert.deepEqual(
    first.windowGroups.map((group) => ({
      id: group.id,
      size: group.size,
      tabbed: group.tabbed,
      ids: group.icons.map((icon) => icon.id),
    })),
    [
      { id: "column 1", size: 2, tabbed: false, ids: [10, 11] },
      { id: "column 2", size: 1, tabbed: false, ids: [3] },
      { id: "window 12", size: 1, tabbed: false, ids: [12] },
    ],
  );
});

const tabbedWindows = [
  window(400, "slack", 3, [1, 1], [1000.0, 2000.0]),
  window(401, "firefox", 3, [2, 1], [1000.0, 2000.0]),
  window(402, "com.mitchellh.ghostty", 3, [2, 2], [1000.0, 2000.0]),
];

test("normalizeNiri marks a tabbed column", () => {
  const result = plain(
    helpers.normalizeNiri("DP-2", workspaces, tabbedWindows, ignoreClasses, icons, 5, outputHeights),
  );
  assert.deepEqual(
    result[1].windowGroups.map((group) => [group.id, group.tabbed]),
    [
      ["column 1", false],
      ["column 2", true],
    ],
  );
});

test("normalizeNiri finds no tabs without the output height", () => {
  const result = plain(
    helpers.normalizeNiri("DP-2", workspaces, tabbedWindows, ignoreClasses, icons, 5),
  );
  assert.ok(result[1].windowGroups.every((group) => !group.tabbed));
});

test("normalizeNiri counts the capped icons in the size of a group", () => {
  const many = [1, 2, 3, 4, 5, 6].map((n) =>
    window(500 + n, "slack", 3, [1, n], [1000.0, 2000.0]),
  );
  const result = plain(
    helpers.normalizeNiri("DP-2", workspaces, many, ignoreClasses, icons, 5, outputHeights),
  );
  const [group] = result[1].windowGroups;
  assert.equal(result[1].windowGroups.length, 1);
  assert.equal(group.size, 6);
  assert.equal(group.tabbed, true);
  assert.equal(group.icons.length, 5);
});

const mapOptions = { maxWidth: 360, height: 80, spacing: 3 };

test("niriWorkspaceMap groups tiles by column and orders them by row", () => {
  const map = plain(
    helpers.niriWorkspaceMap(2, workspaces, windows, ignoreClasses, icons, mapOptions),
  );
  assert.equal(map.columnCount, 2);
  assert.deepEqual(map.columns.map((column) => column.column), [1, 2]);
  assert.deepEqual(map.columns[0].tiles.map((tile) => tile.id), [10, 11]);
  assert.deepEqual(map.columns[1].tiles.map((tile) => tile.id), [3]);
  assert.deepEqual(map.columns.map((column) => column.width), [1536, 3072]);
});

test("niriWorkspaceMap fractions of a column add up to 1", () => {
  const map = plain(
    helpers.niriWorkspaceMap(2, workspaces, windows, ignoreClasses, icons, mapOptions),
  );
  for (const column of map.columns) {
    const sum = column.tiles.reduce((total, tile) => total + tile.fraction, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `column ${column.column} sums to ${sum}`);
  }
  assert.deepEqual(map.columns[0].tiles.map((tile) => tile.fraction), [0.5, 0.5]);
});

test("niriWorkspaceMap puts floating windows apart and leaves out ignored apps", () => {
  const map = plain(
    helpers.niriWorkspaceMap(2, workspaces, windows, ignoreClasses, icons, mapOptions),
  );
  assert.deepEqual(map.floating.map((entry) => entry.id), [12]);
  assert.equal(map.windowCount, 4);
  const ids = map.columns.flatMap((column) => column.tiles.map((tile) => tile.id));
  assert.ok(!ids.includes(13));
  assert.ok(!ids.includes(12));
});

test("niriWorkspaceMap sets the tile fields", () => {
  const map = plain(
    helpers.niriWorkspaceMap(2, workspaces, windows, ignoreClasses, icons, mapOptions),
  );
  const tile = map.columns[1].tiles[0];
  assert.deepEqual(
    { id: tile.id, icon: tile.icon, title: tile.title, focused: tile.focused, urgent: tile.urgent },
    { id: 3, icon: "F", title: "title 3", focused: true, urgent: false },
  );
});

test("niriWorkspaceMap keeps the aspect ratio when the columns fit", () => {
  const map = plain(
    helpers.niriWorkspaceMap(1, workspaces, windows, ignoreClasses, icons, mapOptions),
  );
  assert.equal(map.scale, 80 / 1892);
  assert.ok(map.columns[0].width * map.scale < 360);
});

test("niriWorkspaceMap shrinks the scale so that wide strips fit", () => {
  const wide = [1, 2, 3, 4, 5, 6].map((n) =>
    window(200 + n, "slack", 3, [n, 1], [3072.0, 1700.0]),
  );
  const map = plain(
    helpers.niriWorkspaceMap(3, workspaces, wide, ignoreClasses, icons, mapOptions),
  );
  const stripWidth =
    map.columns.reduce((total, column) => total + column.width * map.scale, 0) +
    3 * (map.columns.length - 1);
  assert.ok(map.scale < 80 / 1700);
  assert.ok(Math.abs(stripWidth - 360) < 1e-9, `strip is ${stripWidth} px wide`);
});

test("niriWorkspaceMap uses the smallest column as the reference height", () => {
  // Column 2 is tabbed: niri reports full-height tiles for each tab.
  const tabbed = [
    window(300, "slack", 3, [1, 1], [1000.0, 1700.0]),
    window(301, "firefox", 3, [2, 1], [1000.0, 1700.0]),
    window(302, "firefox", 3, [2, 2], [1000.0, 1700.0]),
  ];
  const map = plain(
    helpers.niriWorkspaceMap(3, workspaces, tabbed, ignoreClasses, icons, mapOptions),
  );
  assert.equal(map.scale, 80 / 1700);
  assert.deepEqual(map.columns[1].tiles.map((tile) => tile.fraction), [0.5, 0.5]);
});

test("niriWorkspaceMap marks a tabbed column and gives its tabs equal shares", () => {
  const map = plain(
    helpers.niriWorkspaceMap(
      3,
      workspaces,
      tabbedWindows,
      ignoreClasses,
      icons,
      mapOptions,
      outputHeights,
    ),
  );
  assert.deepEqual(
    map.columns.map((column) => column.tabbed),
    [false, true],
  );
  assert.deepEqual(map.columns[1].tiles.map((tile) => tile.fraction), [0.5, 0.5]);
});

test("niriWorkspaceMap gives a tabbed column the height of its tallest tab", () => {
  const onlyTabs = tabbedWindows.slice(1);
  const map = plain(
    helpers.niriWorkspaceMap(3, workspaces, onlyTabs, ignoreClasses, icons, mapOptions, outputHeights),
  );
  assert.equal(map.scale, 80 / 2000);
});

test("niriWorkspaceMap keeps stacked columns without tabs", () => {
  const map = plain(
    helpers.niriWorkspaceMap(2, workspaces, windows, ignoreClasses, icons, mapOptions, outputHeights),
  );
  assert.deepEqual(
    map.columns.map((column) => column.tabbed),
    [false, false],
  );
});

test("niriWorkspaceMap gives an empty map for an unknown workspace", () => {
  const map = plain(
    helpers.niriWorkspaceMap(99, workspaces, windows, ignoreClasses, icons, mapOptions),
  );
  assert.deepEqual(map, { columns: [], floating: [], scale: 0, windowCount: 0, columnCount: 0 });
});

const hyprWorkspaces = [
  { id: 2, name: "2", monitor: "DP-1" },
  { id: 1, name: "code", monitor: "DP-1" },
  { id: 3, name: "3", monitor: "HDMI-A-1" },
];
const hyprClients = [
  { address: "0x1", class: "firefox", workspace: { id: 1 }, focusHistoryID: 0 },
  { address: "0x2", class: "slack", workspace: { id: 1 }, focusHistoryID: 1 },
  { address: "0x3", class: "xwaylandvideobridge", workspace: { id: 2 }, focusHistoryID: 2 },
];
const hyprMonitors = [{ name: "DP-1", activeWorkspace: { id: 1, name: "code" } }];

test("normalizeHyprland sets the new fields", () => {
  const result = plain(
    helpers.normalizeHyprland(
      "DP-1",
      hyprWorkspaces,
      hyprClients,
      hyprMonitors,
      ignoreClasses,
      icons,
      1,
    ),
  );
  assert.deepEqual(result.map((ws) => ws.id), [1, 2]);
  const [code, empty] = result;
  assert.equal(code.named, true);
  assert.equal(code.reference, "1");
  assert.equal(code.active, true);
  assert.equal(code.windowCount, 2);
  assert.equal(code.hiddenCount, 1);
  assert.deepEqual(code.windowIcons.map((icon) => icon.id), ["0x1"]);
  assert.equal(empty.named, false);
  assert.equal(empty.empty, true);
});

test("normalizeHyprland gives each icon a group of its own", () => {
  const [code] = plain(
    helpers.normalizeHyprland(
      "DP-1",
      hyprWorkspaces,
      hyprClients,
      hyprMonitors,
      ignoreClasses,
      icons,
      5,
    ),
  );
  assert.deepEqual(
    code.windowGroups.map((group) => [group.id, group.size, group.tabbed, group.icons.length]),
    [
      ["window 0x1", 1, false, 1],
      ["window 0x2", 1, false, 1],
    ],
  );
});

test("applyNiriEvent activates a workspace on its output", () => {
  const result = plain(
    helpers.applyNiriEvent(
      { workspaces, windows },
      { WorkspaceActivated: { id: 4, focused: false } },
    ),
  );
  const active = result.workspaces.filter((ws) => ws.is_active).map((ws) => ws.id);
  assert.deepEqual(active.sort(), [1, 4]);
  assert.equal(result.refresh, false);
});

test("applyNiriEvent moves the window focus", () => {
  const result = plain(
    helpers.applyNiriEvent({ workspaces, windows }, { WindowFocusChanged: { id: 3 } }),
  );
  const focused = result.windows.filter((w) => w.is_focused).map((w) => w.id);
  assert.deepEqual(focused, [3]);
  assert.equal(result.workspaces, null);
});
