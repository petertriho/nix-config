local wezterm = require("wezterm")

local config = wezterm.config_builder()

config:set_strict_mode(true)

config.color_scheme = "tokyonight"
config.bold_brightens_ansi_colors = true
config.harfbuzz_features = {
    -- https://github.com/JetBrains/JetBrainsMono/wiki/OpenType-features#list-of-features
    "calt=0", -- ligatures off
    "clig=0",
    "liga=0",
    "zero=1", -- slashed zero
    "cv06=1", -- 'm' smaller middle apex
    "cv07=1", -- 'w' smaller middle apex
    "cv12=1", -- 'u spur
    "cv14=1", -- '¢$' broken strikes
}
config.front_end = "WebGpu"
config.window_close_confirmation = "NeverPrompt"
config.hide_tab_bar_if_only_one_tab = true
config.tab_and_split_indices_are_zero_based = false

local leader_key = "b"
config.leader = { key = leader_key, mods = "CTRL" }
config.keys = {
    { mods = "ALT", key = "Enter", action = wezterm.action.DisableDefaultAssignment },
    { mods = "LEADER|CTRL", key = leader_key, action = { SendKey = { mods = "CTRL", key = leader_key } } },
    { mods = "LEADER", key = leader_key, action = "ActivateLastTab" },
    {
        mods = "LEADER",
        key = "\\",
        action = wezterm.action({ SplitHorizontal = { domain = "CurrentPaneDomain" } }),
    },
    { mods = "LEADER", key = "0", action = wezterm.action({ ActivateTab = 10 }) },
    { mods = "LEADER", key = "-", action = wezterm.action({ SplitVertical = { domain = "CurrentPaneDomain" } }) },
    { mods = "LEADER", key = "[", action = "ActivateCopyMode" },
    { mods = "LEADER", key = "]", action = wezterm.action.PasteFrom("Clipboard") },
    { mods = "LEADER", key = "F", action = "QuickSelect" },
    { mods = "LEADER", key = "a", action = "ShowTabNavigator" },
    { mods = "LEADER", key = "c", action = wezterm.action({ SpawnTab = "CurrentPaneDomain" }) },
    { mods = "LEADER", key = "f", action = "ToggleFullScreen" },
    { mods = "LEADER", key = "h", action = wezterm.action({ ActivatePaneDirection = "Left" }) },
    { mods = "LEADER", key = "j", action = wezterm.action({ ActivatePaneDirection = "Down" }) },
    { mods = "LEADER", key = "k", action = wezterm.action({ ActivatePaneDirection = "Up" }) },
    { mods = "LEADER", key = "l", action = wezterm.action({ ActivatePaneDirection = "Right" }) },
    { mods = "LEADER", key = "n", action = wezterm.action({ ActivateTabRelative = 1 }) },
    { mods = "LEADER", key = "p", action = wezterm.action({ ActivateTabRelative = -1 }) },
    { mods = "LEADER", key = "x", action = wezterm.action({ CloseCurrentPane = { confirm = false } }) },
    { mods = "LEADER", key = "z", action = "TogglePaneZoomState" },
    { mods = "LEADER|SHIFT", key = "&", action = wezterm.action({ CloseCurrentTab = { confirm = false } }) },
    { mods = "LEADER|SHIFT", key = "H", action = wezterm.action({ AdjustPaneSize = { "Left", 5 } }) },
    { mods = "LEADER|SHIFT", key = "J", action = wezterm.action({ AdjustPaneSize = { "Down", 5 } }) },
    { mods = "LEADER|SHIFT", key = "K", action = wezterm.action({ AdjustPaneSize = { "Up", 5 } }) },
    { mods = "LEADER|SHIFT", key = "L", action = wezterm.action({ AdjustPaneSize = { "Right", 5 } }) },
}

for i = 1, 9 do
    table.insert(config.keys, {
        mods = "LEADER",
        key = tostring(i),
        action = wezterm.action({ ActivateTab = i - 1 }),
    })
end

config.colors = {
    tab_bar = {
        background = "#0E0E14",
        active_tab = {
            bg_color = "#1A1B26",
            fg_color = "#C0CAF5",
        },
        inactive_tab = {
            bg_color = "#13141C",
            fg_color = "#565F89",
        },
        inactive_tab_hover = {
            bg_color = "#1A1B26",
            fg_color = "#C0CAF5",
        },
        new_tab = {
            bg_color = "#13141C",
            fg_color = "#565F89",
        },
        new_tab_hover = {
            bg_color = "#1A1B26",
            fg_color = "#C0CAF5",
        },
    },
}
config.inactive_pane_hsb = {
    saturation = 1,
    brightness = 1,
}
config.window_padding = {
    left = 0,
    right = 0,
    top = 0,
    bottom = 0,
}
config.use_fancy_tab_bar = false
wezterm.on("format-tab-title", function(tab, tabs, panes, config, hover, max_width)
    local tab_number = tab.tab_index + 1
    local title = wezterm.truncate_right(tab.active_pane.title, max_width - 5)

    if tab.is_active then
        return {
            { Foreground = { Color = "#7aa2f7" } },
            { Text = "▎" },
            { Foreground = { Color = "#C0CAF5" } },
            { Text = tab_number .. ": " .. title .. " " },
        }
    end

    return {
        { Text = " " .. tab_number .. ": " .. title .. " " },
    }
end)

if wezterm.target_triple == "x86_64-pc-windows-msvc" then
    config.default_domain = "WSL:NixOS"
    config.font = wezterm.font("JetBrainsMono Nerd Font")
    config.font_size = 12
    config.allow_win32_input_mode = false
else
    config.font = wezterm.font("JetBrainsMono Nerd Font Mono")
    config.font_size = 14
end

return config
