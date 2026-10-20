pragma Singleton

import QtQuick
import Quickshell

// Shell configuration. Colors, fonts and the notification font sizes come from
// the stylix theme file $XDG_CONFIG_HOME/stylix/quickshell-theme.qml (written by
// home/programs/quickshell.nix). Each group has an inline component type, so
// that the linter resolves keys such as `Config.colors.base0D`.
Singleton {
    id: root

    readonly property Loader themeLoader: Loader {
        source: "file://" + (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/stylix/quickshell-theme.qml"
    }
    readonly property var theme: root.themeLoader.item

    component ColorsGroup: QtObject {
        required property var source
        readonly property string base00: source ? source.base00 : ""
        readonly property string base01: source ? source.base01 : ""
        readonly property string base02: source ? source.base02 : ""
        readonly property string base03: source ? source.base03 : ""
        readonly property string base04: source ? source.base04 : ""
        readonly property string base05: source ? source.base05 : ""
        readonly property string base06: source ? source.base06 : ""
        readonly property string base07: source ? source.base07 : ""
        readonly property string base08: source ? source.base08 : ""
        readonly property string base09: source ? source.base09 : ""
        readonly property string base0A: source ? source.base0A : ""
        readonly property string base0B: source ? source.base0B : ""
        readonly property string base0C: source ? source.base0C : ""
        readonly property string base0D: source ? source.base0D : ""
        readonly property string base0E: source ? source.base0E : ""
        readonly property string base0F: source ? source.base0F : ""
        readonly property string base10: source ? source.base10 : ""
        readonly property string base11: source ? source.base11 : ""
        readonly property string base12: source ? source.base12 : ""
        readonly property string base13: source ? source.base13 : ""
        readonly property string base14: source ? source.base14 : ""
        readonly property string base15: source ? source.base15 : ""
        readonly property string base16: source ? source.base16 : ""
        readonly property string base17: source ? source.base17 : ""
    }

    // The fallbacks match the theme defaults and apply only before it loads.
    component FontsGroup: QtObject {
        required property var source
        readonly property string defaultFamily: source ? source.defaultFamily : "JetBrainsMono Nerd Font Propo"
        readonly property int defaultSize: source ? source.defaultSize : 14
        readonly property int workspaceSize: source ? source.workspaceSize : 12
        readonly property int workspaceIconSize: source ? source.workspaceIconSize : 12
    }

    component BarGroup: QtObject {
        readonly property int height: 28
        readonly property int exclusiveZone: 28
        readonly property int contentMargins: 4
        readonly property int moduleSpacing: 4

        // Right-side modules hidden first→last when the right Row would
        // overlap the centered clock. Order = hide order; any module NOT
        // listed is always shown. Hidden modules reappear inside the tray
        // popup. `tray` is always shown (it hosts the overflow).
        // Valid keys: tray, caffeine, stats, backlight, audio, battery,
        // bluetooth, network, codexbar, notifications, power. The `audio`
        // key maps to the `pulseaudio` module id; `power` →
        // powerManagementLauncher.
        readonly property var rightHidePriority: ["stats", "codexbar", "caffeine", "bluetooth", "backlight", "audio", "battery"]
        // Min gap (px) kept between the clock and the right Row or the window title.
        readonly property int clockGap: 20
    }

    component ModuleGroup: QtObject {
        readonly property int widthPadding: 8
        readonly property int contentMargins: 4
    }

    // Live updates come from the compositor events (see WorkspaceService.qml).
    component WorkspacesGroup: QtObject {
        readonly property int spacing: 4
        // Niri polls (workspaces, active window) that run only while its event stream is down.
        readonly property int updateInterval: 5000
        readonly property int activeUpdateInterval: 2000
        readonly property int baseWidth: 30
        readonly property int height: 18
        required property int fontSize
        required property int iconFontSize
        readonly property var ignoreClasses: ["xwaylandvideobridge"]
    }

    // Mini OSD (On Screen Display) that replaces the bar clock after a volume or
    // brightness change.
    component OsdGroup: QtObject {
        readonly property int hideInterval: 2000
        readonly property int progressBarHeight: 6
        readonly property int progressBarCornerRadius: 3
        readonly property int spacing: 4
    }

    component IntervalsGroup: QtObject {
        readonly property int cpu: 2000
        readonly property int memory: 3000
        readonly property int gpu: 5000
        readonly property int temperature: 5000
    }

    component TemperatureThresholds: QtObject {
        readonly property int warning: 60
        readonly property int critical: 80
    }

    component LevelThresholds: QtObject {
        readonly property int low: 33
        readonly property int medium: 66
    }

    component BatteryThresholds: QtObject {
        readonly property int warning: 30
        readonly property int critical: 15
    }

    component ThresholdsGroup: QtObject {
        readonly property TemperatureThresholds temperature: TemperatureThresholds {}
        readonly property LevelThresholds volume: LevelThresholds {}
        readonly property LevelThresholds brightness: LevelThresholds {}
        readonly property BatteryThresholds battery: BatteryThresholds {}
    }

    component StepsGroup: QtObject {
        readonly property int brightness: 5
        readonly property int volume: 5
    }

    component PopupsGroup: QtObject {
        readonly property int timeoutMs: 5000
        readonly property int itemSpacing: 4
        readonly property int trayIconSize: 0  // 0 = font defaultSize + trayIconOffset
        readonly property int trayIconOffset: 2
    }

    component OverlayGroup: QtObject {
        readonly property int animationDurationMs: 90
        readonly property int closeGraceMs: 110
    }

    component NotificationsGroup: QtObject {
        required property var source
        readonly property int bottomMargin: 12
        readonly property int toastWidth: 360
        readonly property int drawerWidth: 420
        readonly property int maxHistory: 50
        readonly property int maxToasts: 4
        readonly property int toastTimeoutMs: 6000
        readonly property int spacing: 8
        readonly property int iconSize: 42
        readonly property int summaryFontSize: source ? source.summaryFontSize : 14
        readonly property int appFontSize: source ? source.appFontSize : 11
        readonly property int bodyFontSize: source ? source.bodyFontSize : 12
        readonly property int actionFontSize: source ? source.actionFontSize : 11
        readonly property int toastBodyLines: 3
        readonly property int centerBodyLines: 5
        readonly property int headerFontSize: source ? source.headerFontSize : 16
    }

    // CodexBar widget (see modules/CodexBar). CodexBar owns all provider/auth/
    // API-key state; these are display-layer knobs only. Provider setup: see
    // modules/CodexBar/SETUP.md.
    component CodexbarGroup: QtObject {
        // "codexbar" relies on PATH (home.packages). Set an absolute path if the
        // Quickshell systemd unit can't resolve it at runtime.
        readonly property string codexbarPath: "codexbar"
        // A refresh starts two network-heavy Swift CLI queries. Keep the
        // background cadence low; the panel still has a manual refresh action.
        readonly property int refreshIntervalSec: 900
    }

    // Shared look of popups, drawers, toasts and bar modules.
    component StyleGroup: QtObject {
        // Popups, drawers and toasts.
        readonly property int radius: 8
        // Bar modules, pills, buttons and hover highlights.
        readonly property int radiusSmall: 4
        // Inner padding of popups, drawers and cards.
        readonly property int padding: 12
        // Space between the bar and any popup, drawer or toast. Also the
        // screen-edge margin of drawers and toasts.
        readonly property int gap: 6
        required property color borderColor
        required property color surfaceColor
        // Cards inside a drawer.
        required property color cardColor
        required property color hoverColor
        required property color accentColor
    }

    readonly property ColorsGroup colors: ColorsGroup {
        source: root.theme ? root.theme.colors : null
    }

    readonly property FontsGroup fonts: FontsGroup {
        source: root.theme ? root.theme.fonts : null
    }

    // Window class to icon mapping
    readonly property var windowIcons: ({
            "Alacritty": "󰆍",
            "chromium": "󰊯",
            "com.mitchellh.ghostty": "󰆍",
            "discord": "󰙯",
            "firefox": "󰈹",
            "floorp": "󰈹",
            "kitty": "󰄛",
            "org.gnome.Nautilus": "󰉋",
            "slack": "󰒱",
            "thunderbird": "󰇮",
            "thunar": "󰉋",
            "wezterm": "󰆍",
            "org.pwmt.zathura": ""
        })

    readonly property BarGroup bar: BarGroup {}
    readonly property ModuleGroup module: ModuleGroup {}
    readonly property WorkspacesGroup workspaces: WorkspacesGroup {
        fontSize: root.fonts.workspaceSize
        iconFontSize: root.fonts.workspaceIconSize
    }
    readonly property OsdGroup osd: OsdGroup {}
    readonly property IntervalsGroup intervals: IntervalsGroup {}
    readonly property ThresholdsGroup thresholds: ThresholdsGroup {}
    readonly property StepsGroup steps: StepsGroup {}
    readonly property PopupsGroup popups: PopupsGroup {}
    readonly property OverlayGroup overlay: OverlayGroup {}
    readonly property NotificationsGroup notifications: NotificationsGroup {
        source: root.theme ? root.theme.notifications : null
    }
    readonly property CodexbarGroup codexbar: CodexbarGroup {}
    readonly property StyleGroup style: StyleGroup {
        borderColor: root.colors.base02
        // Opaque: with any transparency, bright windows show through the text.
        surfaceColor: root.colors.base01
        cardColor: root.colors.base00
        hoverColor: root.colors.base02
        accentColor: root.colors.base0D
    }
}
