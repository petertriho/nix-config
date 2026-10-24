import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "modules/Bar"
import "modules/Bar/Caffeine"
import "modules/Bar/workspaces"
import "modules/Common"
import "modules/ControlOSD"
import "modules/Notifications"
import "modules/WhichKey"

ShellRoot {
    id: root

    // Singletons load on first use. These two must exist at startup: the
    // notification server registers on D-Bus, and the OSD serves IPC and shortcuts.
    readonly property var eagerServices: [NotificationService, OsdService]

    // Quickshell shows its own popup after each reload. While that popup exists,
    // IPC answers "Not ready to accept queries yet.", and a pointer over it keeps
    // it open until the next reload that shows a popup. IPC (and with it the
    // volume keys) then stops. A failed reload shows a notification instead.
    Connections {
        id: reloadWatcher

        property real lastFailureMs: 0

        target: Quickshell

        function onReloadCompleted(): void {
            Quickshell.inhibitReloadPopup();
        }
        function onReloadFailed(errorString: string): void {
            Quickshell.inhibitReloadPopup();
            // Quickshell emits this signal twice for one failed reload.
            const now = Date.now();
            if (now - reloadWatcher.lastFailureMs < 1000)
                return;
            reloadWatcher.lastFailureMs = now;
            // The last line names the file and line that failed. The log has the full chain.
            const lines = errorString.trim().split("\n");
            const cause = lines[lines.length - 1].trim().replace(/^caused by /, "");
            // The old configuration keeps running, so its notification server shows this.
            // Transient: repeated saves of a broken file do not fill the center.
            Quickshell.execDetached(["notify-send", "-a", "Quickshell", "-e", "-t", "10000", "Configuration reload failed", cause]);
        }
    }

    // Bar components, one per connected screen.
    Variants {
        model: Quickshell.screens

        delegate: Component {
            Bar {
                required property var modelData

                screen: modelData
            }
        }
    }

    IpcHandler {
        target: "quickshell-osd"

        function brightnessUp(): void {
            OsdService.brightnessUp();
        }
        function brightnessDown(): void {
            OsdService.brightnessDown();
        }
        function brightnessShow(): void {
            OsdService.brightnessShow();
        }
        function volumeUp(): void {
            OsdService.volumeUp();
        }
        function volumeDown(): void {
            OsdService.volumeDown();
        }
        function volumeMute(): void {
            OsdService.volumeMute();
        }
    }

    IpcHandler {
        target: "quickshell-notifications"

        function toggle(): void {
            NotificationService.toggleCenter();
        }
        function show(): void {
            NotificationService.showCenter();
        }
        function hide(): void {
            NotificationService.hideCenter();
        }
        function clear(): void {
            NotificationService.clearAll();
        }
    }

    // Keys: "<screen name>:<id>" for bar popups, "notifications", "codexbar".
    IpcHandler {
        target: "quickshell-popups"

        function toggle(key: string): void {
            Popups.toggle(key);
        }
        function open(key: string): void {
            Popups.open(key);
        }
        function close(): void {
            Popups.close();
        }
    }

    // A file change does not always reload the shell. This reloads it on demand.
    IpcHandler {
        target: "quickshell-shell"

        function reload(): void {
            // Later, so the IPC call returns before this generation is destroyed.
            Qt.callLater(() => Quickshell.reload(false));
        }
    }

    // The which-key overlay lists niri binds, so it loads only on niri.
    LazyLoader {
        active: WorkspaceService.compositorName === "niri"

        WhichKeyOverlay {}
    }

    // Shows a layer without held keys, to check the layout. Example:
    // `quickshell ipc call quickshell-whichkey preview Mod+Shift`.
    IpcHandler {
        target: "quickshell-whichkey"

        function preview(layer: string): string {
            return WhichKeyService.preview(layer);
        }
        function hide(): void {
            WhichKeyService.hide();
        }
    }

    IpcHandler {
        target: "quickshell-caffeine"

        function toggle(): void {
            CaffeineService.toggleIndefinite();
        }
        function activate(minutes: int): void {
            CaffeineService.activateWithDuration(minutes);
        }
        function deactivate(): void {
            CaffeineService.deactivate();
        }
        // "off", "on" (no time limit), or the remaining seconds.
        function status(): string {
            if (!CaffeineService.active)
                return "off";
            return CaffeineService.remainingSeconds > 0 ? String(CaffeineService.remainingSeconds) : "on";
        }
    }

    // Hyprland global shortcuts use the compositor protocol; Niri calls the IPC handler above.
    Loader {
        active: WorkspaceService.compositorName === "hyprland"
        sourceComponent: hyprlandGlobalShortcuts
    }

    Component {
        id: hyprlandGlobalShortcuts

        Item {
            GlobalShortcut {
                name: "brightness-up"
                description: "Increase brightness"
                appid: "quickshell-osd"

                onPressed: {
                    OsdService.brightnessUp();
                }
            }

            GlobalShortcut {
                name: "brightness-down"
                description: "Decrease brightness"
                appid: "quickshell-osd"

                onPressed: {
                    OsdService.brightnessDown();
                }
            }

            GlobalShortcut {
                name: "volume-up"
                description: "Increase volume"
                appid: "quickshell-osd"

                onPressed: {
                    OsdService.volumeUp();
                }
            }

            GlobalShortcut {
                name: "volume-down"
                description: "Decrease volume"
                appid: "quickshell-osd"

                onPressed: {
                    OsdService.volumeDown();
                }
            }

            GlobalShortcut {
                name: "volume-mute"
                description: "Toggle mute"
                appid: "quickshell-osd"

                onPressed: {
                    OsdService.volumeMute();
                }
            }
        }
    }
}
