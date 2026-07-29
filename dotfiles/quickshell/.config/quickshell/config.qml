import QtQuick
import Quickshell

QtObject {
    id: root

    readonly property Loader themeLoader: Loader {
        source: "file://" + (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/stylix/quickshell-theme.qml"
    }
    readonly property QtObject theme: themeLoader.item
    readonly property QtObject colors: theme.colors

    // Window class to icon mapping
    property var windowIcons: {
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
        "org.pwmt.zathura": ""
    }

    // Bar configuration
    readonly property QtObject bar: QtObject {
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
        readonly property var rightHidePriority: ["stats", "codexbar", "caffeine", "bluetooth", "backlight", "audio", "battery"]        // Min gap (px) kept between the right Row and the clock before hiding.
        readonly property int clockGap: moduleSpacing * 2
    }

    // Module configuration
    readonly property QtObject module: QtObject {
        readonly property int defaultHeight: 28
        readonly property int widthPadding: 8
        readonly property int contentMargins: 4
    }

    // Workspaces configuration
    readonly property QtObject workspaces: QtObject {
        readonly property int spacing: 4
        readonly property int updateInterval: 200
        readonly property int activeUpdateInterval: 100
        readonly property int baseWidth: 30
        readonly property int iconWidth: 16
        readonly property int iconPadding: 12
        readonly property int height: 18
        readonly property int innerSpacing: 4
        readonly property int fontSize: theme.fonts.workspaceSize
        readonly property int iconFontSize: theme.fonts.workspaceIconSize
        readonly property var ignoreClasses: ["xwaylandvideobridge"]
    }

    // OSD (On Screen Display) configuration
    readonly property QtObject osd: QtObject {
        readonly property int bottomMargin: 50
        readonly property int width: 300
        readonly property int height: 100
        readonly property int cornerRadius: 10
        readonly property real opacity: theme.osd.opacity
        readonly property int contentMargins: 20
        readonly property int contentSpacing: 10
        readonly property int titleFontSize: theme.osd.titleFontSize
        readonly property int progressBarHeight: 20
        readonly property int progressBarCornerRadius: 5
        readonly property int progressFillCornerRadius: 5
        readonly property int valueFontSize: theme.osd.valueFontSize
        readonly property int hideInterval: 2000
    }

    // Update intervals
    readonly property QtObject intervals: QtObject {
        readonly property int global: 5000
        readonly property int clock: 1000
        readonly property int cpu: 2000
        readonly property int memory: 3000
        readonly property int gpu: 5000
        readonly property int temperature: 5000
        readonly property int backlight: 3000
        readonly property int volume: 2000
        readonly property int battery: 5000
        readonly property int network: 5000
        readonly property int tray: 10000
    }

    // Thresholds
    readonly property QtObject thresholds: QtObject {
        readonly property QtObject temperature: QtObject {
            readonly property int critical: 80
        }
        readonly property QtObject volume: QtObject {
            readonly property int low: 33
            readonly property int medium: 66
        }
        readonly property QtObject brightness: QtObject {
            readonly property int low: 33
            readonly property int medium: 66
        }
        readonly property QtObject battery: QtObject {
            readonly property int warning: 30
            readonly property int critical: 15
        }
    }

    // Steps
    readonly property QtObject steps: QtObject {
        readonly property int brightness: 5
        readonly property int volume: 5
    }

    // Popups
    readonly property QtObject popups: QtObject {
        readonly property int timeoutMs: 5000
        readonly property int padding: 16
        readonly property int margin: 8
        readonly property int cornerRadius: 4
        readonly property int itemSpacing: 4
        readonly property int trayIconSize: 0  // 0 = font defaultSize + 2px offset
        readonly property int trayIconOffset: 2
    }

    // Overlay animations
    readonly property QtObject overlay: QtObject {
        readonly property int animationDurationMs: 90
        readonly property int closeGraceMs: 110
    }

    // Notifications
    readonly property QtObject notifications: QtObject {
        readonly property int topMargin: bar.height + 12
        readonly property int rightMargin: 12
        readonly property int bottomMargin: 12
        readonly property int toastWidth: 360
        readonly property int drawerWidth: 420
        readonly property int maxHistory: 50
        readonly property int maxToasts: 4
        readonly property int toastTimeoutMs: 6000
        readonly property int spacing: 8
        readonly property int cardPadding: 12
        readonly property int cornerRadius: 10
        readonly property int iconSize: 42
        readonly property int summaryFontSize: theme.notifications.summaryFontSize
        readonly property int appFontSize: theme.notifications.appFontSize
        readonly property int bodyFontSize: theme.notifications.bodyFontSize
        readonly property int actionFontSize: theme.notifications.actionFontSize
        readonly property int toastBodyLines: 3
        readonly property int centerBodyLines: 5
        readonly property int headerFontSize: theme.notifications.headerFontSize
        readonly property real panelOpacity: theme.notifications.panelOpacity
    }

    // Fonts
    readonly property QtObject fonts: theme.fonts

    // CodexBar widget (see modules/CodexBar). CodexBar owns all provider/auth/
    // API-key state; these are display-layer knobs only. Provider setup: see
    // modules/CodexBar/SETUP.md.
    readonly property QtObject codexbar: QtObject {
        // "codexbar" relies on PATH (home.packages). Set an absolute path if the
        // Quickshell systemd unit can't resolve it at runtime.
        readonly property string codexbarPath: "codexbar"
        readonly property int refreshIntervalSec: 300
        // Drop the panel just below the bar so it never overlaps it (mirrors
        // notifications.topMargin). Single source of truth: tracks bar.height.
        readonly property int topMargin: bar.height + 12
    }
}
