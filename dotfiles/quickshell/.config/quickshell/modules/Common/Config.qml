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

        // Modules hidden first→last when the right Row would come too close
        // to the bar center (the stats module, or the OSD when the stats are
        // hidden). Order = hide order; any module NOT listed is always shown.
        // Hidden modules reappear inside the tray popup. `tray` is always
        // shown (it hosts the overflow).
        // Valid keys: stats (the center module), tray, caffeine, backlight,
        // audio, battery, bluetooth, network, codexbar, clock, notifications,
        // power. The `audio` key maps to the `pulseaudio` module id; `power` →
        // powerManagementLauncher.
        readonly property var rightHidePriority: ["stats", "codexbar", "caffeine", "bluetooth", "backlight", "audio", "battery"]
        // Min gap (px) between the center (stats or OSD) and the window title
        // or the right Row.
        readonly property int centerGap: 20
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
        // Window glyphs on a pill. More windows show as "+k".
        readonly property int maxIcons: 5
        // A named pill shows at most this many characters of the name.
        readonly property int nameMaxChars: 12
        readonly property int animationMs: 120
        // The underline of the active workspace slides to the new pill.
        readonly property int indicatorAnimationMs: 150
        // Hover time before the mini-map opens.
        readonly property int hoverDelayMs: 350
        // The mini-map stays open this long after the pointer leaves the
        // pill and the card. This covers the gap between them.
        readonly property int hoverGraceMs: 150
        readonly property int mapMaxWidth: 360
        readonly property int mapHeight: 80
        // A mini-map tile narrower than this shows only the glyph.
        readonly property int mapTitleMinWidth: 48
        // "Close all windows" waits this long for the second click.
        readonly property int confirmMs: 3000
    }

    // Mini OSD (On Screen Display) that covers the center of the bar after a
    // volume or brightness change.
    component OsdGroup: QtObject {
        readonly property int barWidth: 160
        readonly property int hideInterval: 2000
        readonly property int progressBarHeight: 6
        readonly property int progressBarCornerRadius: 3
        readonly property int spacing: 4
    }

    component IntervalsGroup: QtObject {
        // One tick reads CPU, load, memory, the temperatures and the AMD GPU
        // sysfs files, and adds one sample to each stats history.
        readonly property int stats: 2000
        // GPU tools that run as a process (amdgpu_top, intel_gpu_top, nvidia-smi).
        readonly property int gpu: 5000
    }

    component StatsGroup: QtObject {
        // Length of each stats history: 60 samples × 2 s tick = 2 min.
        readonly property int historySamples: 60
    }

    component TemperatureThresholds: QtObject {
        readonly property int warning: 60
        readonly property int critical: 80
    }

    // A GPU runs hotter than a CPU under normal load.
    component GpuTemperatureThresholds: QtObject {
        readonly property int warning: 80
        readonly property int critical: 95
    }

    // CPU, memory and GPU usage in percent.
    component UsageThresholds: QtObject {
        readonly property int warning: 70
        readonly property int critical: 90
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
        readonly property GpuTemperatureThresholds gpuTemperature: GpuTemperatureThresholds {}
        readonly property UsageThresholds usage: UsageThresholds {}
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

    // Which-key overlay (modules/WhichKey): the niri binds for the held
    // modifiers, in the bottom-right corner, while Mod is held.
    component WhichKeyGroup: QtObject {
        // The overlay shows when Mod was held this long with no key or
        // mouse button press.
        readonly property int delayMs: 500
        // The keymods system service (systems/nixos/modules/desktop-environment/keymods.nix).
        readonly property string socketPath: "/run/keymods.sock"
        // The first retry after a failed connection. Each failure doubles
        // the wait, up to reconnectMaxMs.
        readonly property int reconnectMs: 2000
        readonly property int reconnectMaxMs: 30000
        readonly property int rowSpacing: 2
        // Space between the title and the rows.
        readonly property int titleSpacing: 6
        // Space between two columns of rows.
        readonly property int columnSpacing: 24
        // Space between a key and its title.
        readonly property int keySpacing: 12
        required property int fontSize
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

    // Glyph to the window app IDs (niri `app_id`, Hyprland `class`) that use
    // it. Give each glyph one entry, because a repeated key replaces the
    // earlier one. An app ID can differ from the name of its desktop file, so
    // read it from `niri msg windows`.
    readonly property var windowIconGroups: ({
            // nf-md-console
            "\u{f018d}": ["Alacritty", "com.mitchellh.ghostty", "wezterm"],
            // nf-md-cat
            "\u{f011b}": ["kitty"],
            // nf-md-firefox
            "\u{f0239}": ["firefox", "floorp"],
            // nf-md-google_chrome
            "\u{f02af}": ["chromium-browser"],
            // nf-md-discord
            "\u{f066f}": ["discord"],
            // nf-md-slack
            "\u{f04b1}": ["slack"],
            // nf-md-email
            "\u{f01ee}": ["thunderbird"],
            // nf-md-cloud_sync
            "\u{f063f}": ["com.nextcloud.desktopclient.nextcloud"],
            // nf-md-movie_open
            "\u{f0fce}": ["com.github.iwalton3.jellyfin-mpv-shim"],
            // nf-md-steam
            "\u{f04d3}": ["steam"],
            // nf-md-folder
            "\u{f024b}": ["org.gnome.Nautilus", "thunar"],
            // nf-md-archive
            "\u{f003c}": ["org.gnome.FileRoller"],
            // nf-md-chart_pie
            "\u{f012b}": ["org.gnome.baobab"],
            // nf-md-harddisk
            "\u{f02ca}": ["gnome-disks"],
            // nf-fa-file_pdf_o
            "\u{f1c1}": ["org.pwmt.zathura", "org.gnome.Evince"],
            // nf-md-image
            "\u{f02e9}": ["org.gnome.Loupe"],
            // nf-linux-libreoffice. LibreOffice dialogs, such as the Base
            // database wizard, use `soffice`.
            "\u{f376}": ["libreoffice-startcenter", "soffice"],
            // nf-linux-libreofficewriter
            "\u{f37c}": ["libreoffice-writer"],
            // nf-linux-libreofficecalc
            "\u{f378}": ["libreoffice-calc"],
            // nf-linux-libreofficeimpress
            "\u{f37a}": ["libreoffice-impress"],
            // nf-linux-libreofficedraw
            "\u{f379}": ["libreoffice-draw"],
            // nf-linux-libreofficemath
            "\u{f37b}": ["libreoffice-math"],
            // nf-linux-libreofficebase
            "\u{f377}": ["libreoffice-base"],
            // nf-md-database
            "\u{f01bc}": ["tabularis"],
            // nf-md-calculator
            "\u{f00ec}": ["org.gnome.Calculator"],
            // nf-md-key
            "\u{f0306}": ["org.gnome.seahorse.Application", "org.gnupg.pinentry-qt"],
            // nf-md-volume_high
            "\u{f057e}": ["com.saivert.pwvucontrol"],
            // nf-md-equalizer
            "\u{f0ea2}": ["com.github.wwmm.easyeffects"],
            // nf-md-lan
            "\u{f0317}": ["nm-connection-editor"],
            // nf-md-bluetooth
            "\u{f00af}": ["blueman-manager", "blueman-adapters"],
            // nf-md-expansion_card
            "\u{f08ae}": ["amdgpu_top"],
            // nf-md-keyboard_settings
            "\u{f09f9}": ["input-remapper-gtk"],
            // nf-md-palette
            "\u{f03d8}": ["qt5ct", "qt6ct"],
            // nf-md-cog
            "\u{f0493}": ["dconf-editor"]
        })
    readonly property var windowIcons: {
        const map = {};
        for (const glyph in root.windowIconGroups)
            for (const app of root.windowIconGroups[glyph])
                map[app] = glyph;
        return map;
    }

    readonly property BarGroup bar: BarGroup {}
    readonly property ModuleGroup module: ModuleGroup {}
    readonly property WorkspacesGroup workspaces: WorkspacesGroup {
        fontSize: root.fonts.workspaceSize
        iconFontSize: root.fonts.workspaceIconSize
    }
    readonly property OsdGroup osd: OsdGroup {}
    readonly property IntervalsGroup intervals: IntervalsGroup {}
    readonly property StatsGroup stats: StatsGroup {}
    readonly property ThresholdsGroup thresholds: ThresholdsGroup {}
    readonly property StepsGroup steps: StepsGroup {}
    readonly property PopupsGroup popups: PopupsGroup {}
    readonly property OverlayGroup overlay: OverlayGroup {}
    readonly property NotificationsGroup notifications: NotificationsGroup {
        source: root.theme ? root.theme.notifications : null
    }
    readonly property CodexbarGroup codexbar: CodexbarGroup {}
    readonly property WhichKeyGroup whichKey: WhichKeyGroup {
        fontSize: root.fonts.defaultSize
    }
    readonly property StyleGroup style: StyleGroup {
        borderColor: root.colors.base02
        // Opaque: with any transparency, bright windows show through the text.
        surfaceColor: root.colors.base01
        cardColor: root.colors.base00
        hoverColor: root.colors.base02
        accentColor: root.colors.base0D
    }
}
