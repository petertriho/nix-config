function displayName(value, fallback) {
  return value !== null && value !== undefined && value !== ""
    ? value
    : fallback;
}

function getWindowIcon(windowIcons, key) {
  if (
    key &&
    windowIcons &&
    Object.prototype.hasOwnProperty.call(windowIcons, key)
  ) {
    return windowIcons[key];
  }

  return "󰘔";
}

function detectCompositor(env) {
  if (env.NIRI_SOCKET) return "niri";

  if (env.HYPRLAND_INSTANCE_SIGNATURE) return "hyprland";

  const desktops = (
    (env.XDG_CURRENT_DESKTOP || "") +
    " " +
    (env.XDG_SESSION_DESKTOP || "")
  ).toLowerCase();
  if (desktops.indexOf("niri") !== -1) return "niri";

  if (desktops.indexOf("hyprland") !== -1) return "hyprland";

  return "";
}

// Niri events that never change the bar. Event names that start with
// "Cast" or "KeyboardLayout" are ignored too.
const ignoredNiriEvents = {
  ConfigLoaded: true,
  OverviewOpenedOrClosed: true,
  ScreenshotCaptured: true,
  WindowFocusTimestampChanged: true,
};

function isIgnoredNiriEvent(name) {
  return (
    Object.prototype.hasOwnProperty.call(ignoredNiriEvents, name) ||
    name.indexOf("Cast") === 0 ||
    name.indexOf("KeyboardLayout") === 0
  );
}

function findById(list, id) {
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === id) return list[i];
  }

  return null;
}

// Returns a copy of `list` where `patch(item)` replaced each item it changed,
// or null when it changed nothing. `patch` returns an object with the new
// field values, or null to keep the item. The input is never modified, so
// QML sees a new array only when something changed.
function patchEach(list, patch) {
  let changed = false;
  const result = list.map(function (item) {
    const fields = item ? patch(item) : null;
    if (!fields) return item;

    for (const key in fields) {
      if (item[key] !== fields[key]) {
        changed = true;
        return Object.assign({}, item, fields);
      }
    }

    return item;
  });

  return changed ? result : null;
}

// Applies one niri event-stream event to the cached `state.workspaces` and
// `state.windows`, with the semantics of niri_ipc::state. Returns
// `{ workspaces, windows, refresh }`: a new array for each part that changed
// (null when unchanged), and `refresh: true` when the cache cannot be patched
// (unknown event, or a workspace that is not in the cache).
function applyNiriEvent(state, event) {
  const result = { workspaces: null, windows: null, refresh: false };
  const payload = event && event.Event ? event.Event : event;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    result.refresh = true;
    return result;
  }

  const name = Object.keys(payload)[0] || "";
  const data = payload[name] || {};
  const workspaces = (state && state.workspaces) || [];
  const windows = (state && state.windows) || [];

  if (isIgnoredNiriEvent(name)) return result;

  switch (name) {
    case "WorkspacesChanged":
      if (Array.isArray(data.workspaces)) result.workspaces = data.workspaces;
      else result.refresh = true;
      break;

    case "WindowsChanged":
      if (Array.isArray(data.windows)) result.windows = data.windows;
      else result.refresh = true;
      break;

    // The workspace becomes the active one on its output. With `focused`, it
    // also becomes the only focused workspace on all outputs.
    case "WorkspaceActivated": {
      const target = findById(workspaces, data.id);
      if (!target) {
        result.refresh = true;
        break;
      }

      result.workspaces = patchEach(workspaces, function (ws) {
        const activated = ws.id === data.id;
        const fields = {};
        if (ws.output === target.output) fields.is_active = activated;
        if (data.focused) fields.is_focused = activated;
        return fields;
      });
      break;
    }

    case "WorkspaceActiveWindowChanged":
      if (!findById(workspaces, data.workspace_id)) {
        result.refresh = true;
        break;
      }

      result.workspaces = patchEach(workspaces, function (ws) {
        return ws.id === data.workspace_id
          ? { active_window_id: displayName(data.active_window_id, null) }
          : null;
      });
      break;

    case "WorkspaceUrgencyChanged":
      if (!findById(workspaces, data.id)) {
        result.refresh = true;
        break;
      }

      result.workspaces = patchEach(workspaces, function (ws) {
        return ws.id === data.id ? { is_urgent: !!data.urgent } : null;
      });
      break;

    // A focused window takes the focus from every other window.
    case "WindowOpenedOrChanged": {
      const window = data.window;
      if (!window || window.id === null || window.id === undefined) {
        result.refresh = true;
        break;
      }

      let found = false;
      const next = windows.map(function (w) {
        if (w && w.id === window.id) {
          found = true;
          return window;
        }

        if (window.is_focused && w && w.is_focused)
          return Object.assign({}, w, { is_focused: false });

        return w;
      });
      if (!found) next.push(window);

      result.windows = next;
      break;
    }

    case "WindowClosed":
      if (findById(windows, data.id))
        result.windows = windows.filter(function (w) {
          return !w || w.id !== data.id;
        });
      break;

    // A null id means that no window has the focus.
    case "WindowFocusChanged":
      result.windows = patchEach(windows, function (w) {
        return { is_focused: data.id !== null && data.id !== undefined && w.id === data.id };
      });
      break;

    case "WindowUrgencyChanged":
      result.windows = patchEach(windows, function (w) {
        return w.id === data.id ? { is_urgent: !!data.urgent } : null;
      });
      break;

    // `changes` is a list of [window id, layout] pairs.
    case "WindowLayoutsChanged": {
      const layouts = {};
      const changes = Array.isArray(data.changes) ? data.changes : [];
      for (let i = 0; i < changes.length; i++) {
        if (Array.isArray(changes[i]) && changes[i].length === 2)
          layouts[changes[i][0]] = changes[i][1];
      }

      result.windows = patchEach(windows, function (w) {
        return Object.prototype.hasOwnProperty.call(layouts, w.id)
          ? { layout: layouts[w.id] }
          : null;
      });
      break;
    }

    default:
      result.refresh = true;
  }

  return result;
}

function appIdOf(window) {
  return window.app_id || window.appId || "";
}

// Groups the items of `list` by `keyOf(item)`. Items without a key are left
// out.
function groupBy(list, keyOf) {
  const groups = {};
  for (let i = 0; i < (list || []).length; i++) {
    const item = list[i];
    const key = item ? keyOf(item) : null;
    if (key === null || key === undefined) continue;

    if (!Object.prototype.hasOwnProperty.call(groups, key)) groups[key] = [];
    groups[key].push(item);
  }

  return groups;
}

// Orders niri windows by column, then by row. Windows without a scrolling
// position (floating windows) come last.
function compareScrollingPosition(a, b) {
  const aPos =
    a.layout && a.layout.pos_in_scrolling_layout
      ? a.layout.pos_in_scrolling_layout
      : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  const bPos =
    b.layout && b.layout.pos_in_scrolling_layout
      ? b.layout.pos_in_scrolling_layout
      : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];

  if (aPos[0] !== bPos[0]) return aPos[0] - bPos[0];

  return aPos[1] - bPos[1];
}

function isNiriWindowFocused(workspace, window) {
  const activeId = workspace.active_window_id;
  return (
    (activeId !== null && activeId !== undefined && window.id === activeId) ||
    !!window.is_focused
  );
}

// Keeps the first `max` icons. The focused icon always stays: when it comes
// later, it takes the place of the last kept icon. A `max` of 0 or less keeps
// all icons. Returns `{ icons, hiddenCount }`.
function capIcons(icons, max) {
  const list = icons || [];
  if (!(max > 0) || list.length <= max) return { icons: list, hiddenCount: 0 };

  const kept = list.slice(0, max);
  const keptFocused = kept.some(function (icon) {
    return icon.focused;
  });
  if (!keptFocused) {
    for (let i = max; i < list.length; i++) {
      if (list[i].focused) {
        kept[max - 1] = list[i];
        break;
      }
    }
  }

  return { icons: kept, hiddenCount: list.length - max };
}

function normalizeHyprland(
  outputName,
  workspaces,
  clients,
  monitors,
  ignoreClasses,
  windowIcons,
  maxIcons,
) {
  const requestedOutput = displayName(outputName, "");
  if (!requestedOutput) return [];

  const monitor = findHyprlandMonitor(outputName, monitors);
  const activeWorkspace = monitor ? monitor.activeWorkspace || {} : {};
  const activeWorkspaceId = activeWorkspace.id;
  const sortedWorkspaces = (workspaces || []).filter(function (workspace) {
    return workspace.monitor === requestedOutput;
  }).sort(function (a, b) {
    return a.id - b.id;
  });
  const ignored = ignoreClasses || [];
  const clientsByWorkspace = groupBy(clients, function (client) {
    return client.workspace ? client.workspace.id : null;
  });
  const result = [];

  for (let i = 0; i < sortedWorkspaces.length; i++) {
    const workspace = sortedWorkspaces[i];
    const workspaceClients = clientsByWorkspace[workspace.id] || [];
    const icons = [];

    for (let j = 0; j < workspaceClients.length; j++) {
      const client = workspaceClients[j];
      const className = client.class || client.initialClass || "";

      if (ignored.indexOf(className) !== -1) continue;

      icons.push({
        id: client.address,
        icon: getWindowIcon(windowIcons, className),
        focused: client.focusHistoryID === 0,
        urgent: false,
      });
    }

    const index = workspace.id.toString();
    const name = displayName(workspace.name, index);
    const capped = capIcons(icons, maxIcons);

    result.push({
      id: workspace.id,
      idx: workspace.id,
      name: name,
      named: name !== index,
      reference: index,
      switchTarget: index,
      active: workspace.id === activeWorkspaceId,
      urgent: false,
      empty: icons.length === 0,
      windowCount: icons.length,
      hiddenCount: capped.hiddenCount,
      windowIcons: capped.icons,
    });
  }

  return result;
}

// `reference` is the workspace argument of `niri msg action`: the name of a
// named workspace, else its index on the output.
function normalizeNiri(
  outputName,
  workspaces,
  windows,
  ignoreClasses,
  windowIcons,
  maxIcons,
) {
  const requestedOutput = displayName(outputName, "");
  if (!requestedOutput) return [];

  const sortedWorkspaces = (workspaces || []).filter(function (workspace) {
    return workspace.output === requestedOutput;
  }).sort(function (a, b) {
    return a.idx - b.idx;
  });
  const ignored = ignoreClasses || [];
  const windowsByWorkspace = groupBy(windows, function (window) {
    return window.workspace_id;
  });
  const result = [];

  for (let i = 0; i < sortedWorkspaces.length; i++) {
    const workspace = sortedWorkspaces[i];
    const display = displayName(workspace.name, workspace.idx.toString());
    const allWindows = windowsByWorkspace[workspace.id] || [];
    // An ignored window still makes its workspace urgent.
    const urgent =
      !!workspace.is_urgent ||
      allWindows.some(function (window) {
        return !!window.is_urgent;
      });
    const icons = allWindows
      .filter(function (window) {
        return ignored.indexOf(appIdOf(window)) === -1;
      })
      .sort(compareScrollingPosition)
      .map(function (window) {
        return {
          id: window.id,
          icon: getWindowIcon(windowIcons, appIdOf(window)),
          focused: isNiriWindowFocused(workspace, window),
          urgent: !!window.is_urgent,
        };
      });
    const capped = capIcons(icons, maxIcons);

    result.push({
      id: workspace.id,
      idx: workspace.idx,
      name: display,
      named: displayName(workspace.name, "") !== "",
      reference: display,
      switchTarget: display,
      active: !!workspace.is_active,
      urgent: urgent,
      empty: icons.length === 0,
      windowCount: icons.length,
      hiddenCount: capped.hiddenCount,
      windowIcons: capped.icons,
    });
  }

  return result;
}

// The windows of a niri workspace, laid out for the mini-map. Ignored app ids
// are left out. Returns:
//   columns: [{ column, width, tiles: [{ id, icon, title, focused, urgent,
//            fraction }] }], ordered by column, the tiles ordered by row.
//            `width` is the widest tile in logical pixels. `fraction` is the
//            share of the column height that the tile takes.
//   floating: [{ id, icon, title, focused, urgent }]: the floating windows,
//            and the windows without a scrolling position.
//   scale:   map pixels for each logical pixel. It keeps the real aspect
//            ratio of a column that is `options.height` high, and gets smaller
//            when the columns and the `options.spacing` between them do not
//            fit `options.maxWidth`.
//   windowCount, columnCount
// The reference column height is the smallest column: a tabbed column stacks
// full-height tiles, so its sum is too large.
function niriWorkspaceMap(
  workspaceId,
  workspaces,
  windows,
  ignoreClasses,
  windowIcons,
  options,
) {
  const result = {
    columns: [],
    floating: [],
    scale: 0,
    windowCount: 0,
    columnCount: 0,
  };
  const workspace = findById(workspaces || [], workspaceId);
  if (!workspace) return result;

  const opts = options || {};
  const ignored = ignoreClasses || [];
  const tiled = [];

  for (let i = 0; i < (windows || []).length; i++) {
    const window = windows[i];
    if (!window || window.workspace_id !== workspaceId) continue;

    const appId = appIdOf(window);
    if (ignored.indexOf(appId) !== -1) continue;

    const entry = {
      id: window.id,
      icon: getWindowIcon(windowIcons, appId),
      title: displayName(window.title, appId),
      focused: isNiriWindowFocused(workspace, window),
      urgent: !!window.is_urgent,
    };
    const layout = window.layout || {};
    const pos = layout.pos_in_scrolling_layout;
    if (window.is_floating || !Array.isArray(pos)) {
      result.floating.push(entry);
      continue;
    }

    const size = Array.isArray(layout.tile_size) ? layout.tile_size : [];
    tiled.push({
      entry: entry,
      column: pos[0],
      row: pos[1],
      width: size[0] > 0 ? size[0] : 0,
      height: size[1] > 0 ? size[1] : 0,
    });
  }

  tiled.sort(function (a, b) {
    return a.column - b.column || a.row - b.row;
  });

  const groups = [];
  for (let i = 0; i < tiled.length; i++) {
    const tile = tiled[i];
    let group = groups[groups.length - 1];
    if (!group || group.column !== tile.column) {
      group = { column: tile.column, width: 0, height: 0, tiles: [] };
      groups.push(group);
    }

    group.width = Math.max(group.width, tile.width);
    group.height += tile.height;
    group.tiles.push(tile);
  }

  let totalWidth = 0;
  let referenceHeight = 0;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    totalWidth += group.width;
    if (group.height > 0 && (referenceHeight === 0 || group.height < referenceHeight))
      referenceHeight = group.height;

    result.columns.push({
      column: group.column,
      width: group.width,
      tiles: group.tiles.map(function (tile) {
        return Object.assign({}, tile.entry, {
          fraction:
            group.height > 0 ? tile.height / group.height : 1 / group.tiles.length,
        });
      }),
    });
  }

  const spacing = opts.spacing > 0 ? opts.spacing : 0;
  const available = (opts.maxWidth || 0) - spacing * Math.max(0, groups.length - 1);
  let scale = referenceHeight > 0 && opts.height > 0 ? opts.height / referenceHeight : 0;
  if (totalWidth > 0 && available > 0)
    scale = scale > 0 ? Math.min(scale, available / totalWidth) : available / totalWidth;

  result.scale = scale;
  result.windowCount = tiled.length + result.floating.length;
  result.columnCount = groups.length;
  return result;
}

// The active window of the active workspace on an output, or null.
function activeNiriWindowForOutput(outputName, workspaces, windows) {
  const requestedOutput = displayName(outputName, "");
  if (!requestedOutput) return null;

  for (let i = 0; i < (workspaces || []).length; i++) {
    const workspace = workspaces[i];
    const output = displayName(workspace.output, "");

    if (output !== requestedOutput || !workspace.is_active) continue;

    const id = workspace.active_window_id;
    return id === null || id === undefined ? null : findById(windows || [], id);
  }

  return null;
}

function activeNiriWindowTitleForOutput(outputName, workspaces, windows) {
  const window = activeNiriWindowForOutput(outputName, workspaces, windows);
  return window
    ? displayName(window.title, displayName(window.app_id || window.appId, ""))
    : "";
}

// Name of the output of the focused workspace, or "".
function focusedNiriOutput(workspaces) {
  for (let i = 0; i < (workspaces || []).length; i++) {
    if (workspaces[i].is_focused) return displayName(workspaces[i].output, "");
  }

  return "";
}

function findHyprlandMonitor(outputName, monitors) {
  const requestedOutput = displayName(outputName, "");
  if (!requestedOutput) return null;

  for (let i = 0; i < (monitors || []).length; i++) {
    const monitor = monitors[i];
    if (monitor && monitor.name === requestedOutput) return monitor;
  }

  return null;
}

// `hyprctl monitors` gives only the id and name of the active workspace. The
// last window title of a workspace is in `hyprctl workspaces`.
function activeHyprlandWindowTitleForOutput(outputName, monitors, workspaces) {
  const monitor = findHyprlandMonitor(outputName, monitors);
  if (!monitor || !monitor.activeWorkspace) return "";

  const workspace = findById(workspaces || [], monitor.activeWorkspace.id);
  if (workspace) return displayName(workspace.lastwindowtitle, "");

  return displayName(monitor.activeWorkspace.lastwindowtitle, "");
}
