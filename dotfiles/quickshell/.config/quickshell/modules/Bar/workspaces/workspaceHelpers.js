function displayName(value, fallback) {
    return value !== null && value !== undefined && value !== "" ? value : fallback;
}

function getWindowIcon(windowIcons, key) {
    if (key && windowIcons && Object.prototype.hasOwnProperty.call(windowIcons, key)) {
        return windowIcons[key];
    }

    return "󰘔";
}

function parseEnvironmentSnapshot(output) {
    const env = {
        NIRI_SOCKET: "",
        HYPRLAND_INSTANCE_SIGNATURE: "",
        XDG_CURRENT_DESKTOP: "",
        XDG_SESSION_DESKTOP: ""
    };

    const lines = (output || "").split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line)
            continue;

        const separator = line.indexOf("=");
        if (separator === -1)
            continue;

        const key = line.slice(0, separator);
        env[key] = line.slice(separator + 1).trim();
    }

    return env;
}

function detectCompositor(env) {
    if (env.NIRI_SOCKET)
        return "niri";

    if (env.HYPRLAND_INSTANCE_SIGNATURE)
        return "hyprland";

    const desktops = ((env.XDG_CURRENT_DESKTOP || "") + " " + (env.XDG_SESSION_DESKTOP || "")).toLowerCase();
    if (desktops.indexOf("niri") !== -1)
        return "niri";

    if (desktops.indexOf("hyprland") !== -1)
        return "hyprland";

    return "";
}

function shouldEnableHyprlandGlobalShortcuts(compositorName) {
    return compositorName === "hyprland";
}

function normalizeHyprland(workspaces, activeWorkspaceId, clients, ignoreClasses, windowIcons) {
    const sortedWorkspaces = (workspaces || []).slice().sort(function(a, b) {
        return a.id - b.id;
    });
    const ignored = ignoreClasses || [];
    const result = [];

    for (let i = 0; i < sortedWorkspaces.length; i++) {
        const workspace = sortedWorkspaces[i];
        const icons = [];

        for (let j = 0; j < (clients || []).length; j++) {
            const client = clients[j];
            const workspaceRef = client.workspace || {};
            const className = client.class || client.initialClass || "";

            if (workspaceRef.id !== workspace.id)
                continue;

            if (ignored.indexOf(className) !== -1)
                continue;

            icons.push({
                icon: getWindowIcon(windowIcons, className),
                focused: client.focusHistoryID === 0
            });
        }

        result.push({
            id: workspace.id,
            name: displayName(workspace.name, workspace.id.toString()),
            switchTarget: workspace.id.toString(),
            active: workspace.id === activeWorkspaceId,
            windowIcons: icons
        });
    }

    return result;
}

function normalizeNiri(workspaces, windows, ignoreClasses, windowIcons) {
    const outputOrder = [];
    const outputIndexes = {};
    const sortedWorkspaces = (workspaces || []).slice().sort(function(a, b) {
        const aOutput = displayName(a.output, "");
        const bOutput = displayName(b.output, "");

        if (!Object.prototype.hasOwnProperty.call(outputIndexes, aOutput)) {
            outputIndexes[aOutput] = outputOrder.length;
            outputOrder.push(aOutput);
        }

        if (!Object.prototype.hasOwnProperty.call(outputIndexes, bOutput)) {
            outputIndexes[bOutput] = outputOrder.length;
            outputOrder.push(bOutput);
        }

        if (outputIndexes[aOutput] !== outputIndexes[bOutput])
            return outputIndexes[aOutput] - outputIndexes[bOutput];

        return a.idx - b.idx;
    });
    const ignored = ignoreClasses || [];
    const hasFocusedWorkspace = sortedWorkspaces.some(function(workspace) {
        return !!workspace.is_focused;
    });
    const result = [];

    for (let i = 0; i < sortedWorkspaces.length; i++) {
        const workspace = sortedWorkspaces[i];
        const display = displayName(workspace.name, workspace.idx.toString());
        const icons = [];
        const workspaceWindows = [];

        for (let j = 0; j < (windows || []).length; j++) {
            const window = windows[j];
            const appId = window.app_id || window.appId || "";

            if (window.workspace_id !== workspace.id)
                continue;

            if (ignored.indexOf(appId) !== -1)
                continue;

            workspaceWindows.push(window);
        }

        workspaceWindows.sort(function(a, b) {
            const aPos = a.layout && a.layout.pos_in_scrolling_layout ? a.layout.pos_in_scrolling_layout : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
            const bPos = b.layout && b.layout.pos_in_scrolling_layout ? b.layout.pos_in_scrolling_layout : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];

            if (aPos[0] !== bPos[0])
                return aPos[0] - bPos[0];

            return aPos[1] - bPos[1];
        });

        for (let j = 0; j < workspaceWindows.length; j++) {
            const window = workspaceWindows[j];
            const appId = window.app_id || window.appId || "";

            icons.push({
                icon: getWindowIcon(windowIcons, appId),
                focused: (workspace.active_window_id !== null && workspace.active_window_id !== undefined && window.id === workspace.active_window_id) || !!window.is_focused
            });
        }

        result.push({
            id: workspace.id,
            name: display,
            switchTarget: display,
            active: hasFocusedWorkspace ? !!workspace.is_focused : !!workspace.is_active,
            windowIcons: icons
        });
    }

    return result;
}
