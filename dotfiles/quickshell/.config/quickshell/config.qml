import QtQuick

QtObject {
    id: root

    // Colors object accessible to all components
    property QtObject colors: QtObject {
        readonly property string bg: "#16161e"
        readonly property string bg_dark: "#16161e"
        readonly property string bg_dark1: "#0C0E14"
        readonly property string bg_float: "#16161e"
        readonly property string bg_highlight: "#292e42"
        readonly property string bg_popup: "#16161e"
        readonly property string bg_search: "#3d59a1"
        readonly property string bg_sidebar: "#16161e"
        readonly property string bg_statusline: "#16161e"
        readonly property string bg_visual: "#283457"
        readonly property string black: "#15161e"
        readonly property string blue: "#7aa2f7"
        readonly property string blue0: "#3d59a1"
        readonly property string blue1: "#2ac3de"
        readonly property string blue2: "#0db9d7"
        readonly property string blue5: "#89ddff"
        readonly property string blue6: "#b4f9f8"
        readonly property string blue7: "#394b70"
        readonly property string border: "#15161e"
        readonly property string border_highlight: "#27a1b9"
        readonly property string comment: "#565f89"
        readonly property string cyan: "#7dcfff"
        readonly property string dark3: "#545c7e"
        readonly property string dark5: "#737aa2"
        readonly property string error: "#db4b4b"
        readonly property string fg: "#a9b1d6"
        readonly property string fg_dark: "#a9b1d6"
        readonly property string fg_float: "#c0caf5"
        readonly property string fg_gutter: "#3b4261"
        readonly property string fg_sidebar: "#a9b1d6"
        readonly property string green: "#9ece6a"
        readonly property string green1: "#73daca"
        readonly property string green2: "#41a6b5"
        readonly property string hint: "#1abc9c"
        readonly property string info: "#0db9d7"
        readonly property string magenta: "#bb9af7"
        readonly property string magenta2: "#ff007c"
        readonly property string none: "NONE"
        readonly property string orange: "#ff9e64"
        readonly property string purple: "#9d7cd8"
        readonly property string red: "#f7768e"
        readonly property string red1: "#db4b4b"
        readonly property string teal: "#1abc9c"
        readonly property string terminal_black: "#414868"
        readonly property string todo: "#7aa2f7"
        readonly property string warning: "#e0af68"
        readonly property string yellow: "#e0af68"

        // Nested objects as properties
        readonly property QtObject diff: QtObject {
            readonly property string add: "#20303b"
            readonly property string change: "#1f2231"
            readonly property string delete_color: "#37222c"
            readonly property string text: "#394b70"
        }

        readonly property QtObject git: QtObject {
            readonly property string add: "#449dab"
            readonly property string change: "#6183bb"
            readonly property string delete_color: "#914c54"
            readonly property string ignore: "#545c7e"
        }

        readonly property QtObject terminal: QtObject {
            readonly property string black: "#15161e"
            readonly property string black_bright: "#414868"
            readonly property string blue: "#7aa2f7"
            readonly property string blue_bright: "#8db0ff"
            readonly property string cyan: "#7dcfff"
            readonly property string cyan_bright: "#a4daff"
            readonly property string green: "#9ece6a"
            readonly property string green_bright: "#9fe044"
            readonly property string magenta: "#bb9af7"
            readonly property string magenta_bright: "#c7a9ff"
            readonly property string red: "#f7768e"
            readonly property string red_bright: "#ff899d"
            readonly property string white: "#a9b1d6"
            readonly property string white_bright: "#c0caf5"
            readonly property string yellow: "#e0af68"
            readonly property string yellow_bright: "#faba4a"
        }

        readonly property var rainbow: ["#7aa2f7", "#e0af68", "#9ece6a", "#1abc9c", "#bb9af7", "#9d7cd8", "#ff9e64", "#f7768e"]
    }

    // Window class to icon mapping
    property var windowIcons: {
        "Alacritty": "󰆍",
        "chromium": "󰊯",
        "com.mitchellh.ghostty": "󰆍",
        "discord": "󰙯",
        "firefox": "󰈹",
        "floorp": "󰈹",
        "kitty": "󰄛",
        "nautilus": "󰉋",
        "org.kde.dolphin": "󰉋",
        "slack": "󰒱",
        "thunar": "󰉋",
        "wezterm": "󰆍"
    }

    // Bar configuration
    readonly property QtObject bar: QtObject {
        readonly property int height: 24
        readonly property int exclusiveZone: 24
        readonly property int contentMargins: 4
        readonly property int moduleSpacing: 4
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
        readonly property int fontSize: 12
        readonly property int iconFontSize: 12
    }

    // OSD (On Screen Display) configuration
    readonly property QtObject osd: QtObject {
        readonly property int bottomMargin: 50
        readonly property int width: 300
        readonly property int height: 100
        readonly property int cornerRadius: 10
        readonly property real opacity: 0.9
        readonly property int contentMargins: 20
        readonly property int contentSpacing: 10
        readonly property int titleFontSize: 16
        readonly property int progressBarHeight: 20
        readonly property int progressBarCornerRadius: 5
        readonly property int progressFillCornerRadius: 5
        readonly property int valueFontSize: 14
        readonly property int hideInterval: 2000
        readonly property string mutedProgressColor: "#f38ba8"
    }

    // Update intervals
    readonly property QtObject intervals: QtObject {
        readonly property int global: 5000
        readonly property int clock: 1000
        readonly property int cpu: 2000
        readonly property int memory: 3000
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

    // Fonts
    readonly property QtObject fonts: QtObject {
        readonly property string defaultFamily: "JetBrainsMono Nerd Font Propo"
        readonly property int defaultSize: 13
        readonly property int workspaceSize: 12
        readonly property int workspaceIconSize: 12
    }
}
