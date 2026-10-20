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

function normalizeHyprland(
  outputName,
  workspaces,
  clients,
  monitors,
  ignoreClasses,
  windowIcons,
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
  const workspaceIds = {};
  const result = [];

  for (let i = 0; i < sortedWorkspaces.length; i++) {
    workspaceIds[sortedWorkspaces[i].id] = true;
  }

  for (let i = 0; i < sortedWorkspaces.length; i++) {
    const workspace = sortedWorkspaces[i];
    const icons = [];

    for (let j = 0; j < (clients || []).length; j++) {
      const client = clients[j];
      const workspaceRef = client.workspace || {};
      const className = client.class || client.initialClass || "";

      if (!Object.prototype.hasOwnProperty.call(workspaceIds, workspaceRef.id))
        continue;

      if (workspaceRef.id !== workspace.id) continue;

      if (ignored.indexOf(className) !== -1) continue;

      icons.push({
        id: client.address,
        icon: getWindowIcon(windowIcons, className),
        focused: client.focusHistoryID === 0,
        urgent: false,
      });
    }

    result.push({
      id: workspace.id,
      name: displayName(workspace.name, workspace.id.toString()),
      switchTarget: workspace.id.toString(),
      active: workspace.id === activeWorkspaceId,
      urgent: false,
      windowIcons: icons,
    });
  }

  return result;
}

function normalizeNiri(outputName, workspaces, windows, ignoreClasses, windowIcons) {
  const requestedOutput = displayName(outputName, "");
  if (!requestedOutput) return [];

  const sortedWorkspaces = (workspaces || []).filter(function (workspace) {
    return workspace.output === requestedOutput;
  }).sort(function (a, b) {
    return a.idx - b.idx;
  });
  const ignored = ignoreClasses || [];
  const workspaceIds = {};
  const result = [];

  for (let i = 0; i < sortedWorkspaces.length; i++) {
    workspaceIds[sortedWorkspaces[i].id] = true;
  }

  for (let i = 0; i < sortedWorkspaces.length; i++) {
    const workspace = sortedWorkspaces[i];
    const display = displayName(workspace.name, workspace.idx.toString());
    const icons = [];
    const workspaceWindows = [];
    let urgent = !!workspace.is_urgent;

    for (let j = 0; j < (windows || []).length; j++) {
      const window = windows[j];
      const appId = window.app_id || window.appId || "";

      if (!Object.prototype.hasOwnProperty.call(workspaceIds, window.workspace_id))
        continue;

      if (window.workspace_id !== workspace.id) continue;

      if (window.is_urgent) urgent = true;

      if (ignored.indexOf(appId) !== -1) continue;

      workspaceWindows.push(window);
    }

    workspaceWindows.sort(function (a, b) {
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
    });

    for (let j = 0; j < workspaceWindows.length; j++) {
      const window = workspaceWindows[j];
      const appId = window.app_id || window.appId || "";

      icons.push({
        id: window.id,
        icon: getWindowIcon(windowIcons, appId),
        focused:
          (workspace.active_window_id !== null &&
            workspace.active_window_id !== undefined &&
            window.id === workspace.active_window_id) ||
          !!window.is_focused,
        urgent: !!window.is_urgent,
      });
    }

    result.push({
      id: workspace.id,
      name: display,
      switchTarget: display,
      active: !!workspace.is_active,
      urgent: urgent,
      windowIcons: icons,
    });
  }

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
