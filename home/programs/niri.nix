{
  config,
  inputs,
  lib,
  pkgs,
  ...
}:
let
  niriSettings = config.programs.niri.settings;
  colors = config.lib.stylix.colors.withHashtag;
  niriActions = config.lib.niri.actions;
  niriQuickshellOsd = command: niriActions.spawn "quickshell" "ipc" "call" "quickshell-osd" command;
  niriQuickshellNotifications =
    command: niriActions.spawn "quickshell" "ipc" "call" "quickshell-notifications" command;
  niriWorkspaceBinds = builtins.listToAttrs (
    builtins.concatLists (
      builtins.genList (
        i:
        let
          ws = i + 1;
          key = if ws == 10 then "0" else toString ws;
        in
        [
          {
            name = "Mod+${key}";
            value.action = niriActions.focus-workspace ws;
          }
          {
            name = "Mod+Ctrl+${key}";
            value.action.move-column-to-workspace = ws;
          }
          {
            name = "Mod+Shift+${key}";
            value.action.move-window-to-workspace = [
              { focus = true; }
              ws
            ];
          }
        ]
      ) 10
    )
  );
  # The which-key overlay shows these labels on the modifier rows, like which-key groups.
  # A layer without a label shows its bind count.
  whichKeyGroups = {
    "Mod+Alt" = "monitor: focus";
    "Mod+Alt+Ctrl" = "monitor: move column";
    "Mod+Alt+Shift" = "monitor: move window";
    "Mod+Alt+Ctrl+Shift" = "monitor: move workspace";
    "Mod+Ctrl" = "column/workspace";
    "Mod+Ctrl+Shift" = "move column/workspace";
    "Mod+Shift" = "move";
  };
in
{
  imports = [
    inputs.niri.homeModules.niri
  ];

  home.packages = [ pkgs.xwayland-satellite ];

  # The keymods reader reports Super as Mod, so the which-key overlay supports only Super.
  assertions = [
    {
      assertion = builtins.elem niriSettings.input.mod-key [
        null
        "Super"
      ];
      message = "The Quickshell which-key overlay supports only Super as the niri mod key.";
    }
  ];

  # The Quickshell which-key overlay lists these binds. It makes the titles and merges
  # the rows (modules/WhichKey/whichKeyHelpers.js), so this file keeps the raw actions.
  xdg.configFile."niri/which-key-binds.json".text = builtins.toJSON {
    binds = lib.mapAttrsToList (key: bind: {
      inherit key;
      inherit (bind) action;
      title = bind.hotkey-overlay.title or null;
    }) (lib.filterAttrs (_: bind: !(bind.hotkey-overlay.hidden or false)) niriSettings.binds);
    groups = whichKeyGroups;
  };

  programs.niri = {
    enable = true;
    package = pkgs.niri-unstable;
    settings = {
      input = {
        keyboard = {
          xkb.layout = "us";
          numlock = true;
        };
        touchpad = {
          tap = true;
          dwt = true;
          natural-scroll = true;
          drag = true;
        };
        # focus-follows-mouse.max-scroll-amount = "0%";
      };

      layout = {
        # The focus ring draws in the gap around the window. Keep gaps at least the ring
        # width, or the ring draws over the neighbouring window.
        gaps = 4;
        center-focused-column = "on-overflow";
        background-color = colors.base00;
        focus-ring = {
          enable = true;
          width = 2;
          active.color = colors.base0D;
          inactive.color = colors.base03;
          urgent.color = colors.base08;
        };
        # Full-width columns leave no room outside the window, so an outside indicator
        # draws off-screen.
        tab-indicator = {
          place-within-column = true;
          hide-when-single-tab = true;
        };
        preset-column-widths = [
          { proportion = 0.33333; }
          { proportion = 0.5; }
          { proportion = 0.66667; }
          { proportion = 1.0; }
        ];
        default-column-width.proportion = 1.0;
      };

      prefer-no-csd = true;

      gestures.hot-corners.enable = false;

      screenshot-path = "~/Pictures/Screenshots/Screenshot from %Y-%m-%d %H-%M-%S.png";

      binds =
        with niriActions;
        {
          # Niri's Mod+left/right mouse move/resize gestures are built in, so no bind is needed.

          # System/Hardware Keys
          "Print".action.screenshot = {
            show-pointer = false;
          };
          "Ctrl+Print".action.screenshot-screen = {
            show-pointer = false;
          };
          "Alt+Print".action.screenshot-window = {
            show-pointer = true;
          };
          "XF86AudioMute" = {
            allow-when-locked = true;
            action = niriQuickshellOsd "volumeMute";
          };
          "XF86AudioLowerVolume" = {
            allow-when-locked = true;
            action = niriQuickshellOsd "volumeDown";
          };
          "XF86AudioRaiseVolume" = {
            allow-when-locked = true;
            action = niriQuickshellOsd "volumeUp";
          };
          # quickshell-osd has no mic handler, so this mutes without an OSD.
          "XF86AudioMicMute" = {
            allow-when-locked = true;
            action = spawn "wpctl" "set-mute" "@DEFAULT_AUDIO_SOURCE@" "toggle";
          };
          "XF86MonBrightnessDown" = {
            allow-when-locked = true;
            action = niriQuickshellOsd "brightnessDown";
          };
          "XF86MonBrightnessUp" = {
            allow-when-locked = true;
            action = niriQuickshellOsd "brightnessUp";
          };
          "XF86AudioPlay" = {
            allow-when-locked = true;
            action = spawn "playerctl" "play-pause";
          };
          "XF86AudioPause" = {
            allow-when-locked = true;
            action = spawn "playerctl" "play-pause";
          };
          "XF86AudioStop" = {
            allow-when-locked = true;
            action = spawn "playerctl" "stop";
          };
          "XF86AudioPrev" = {
            allow-when-locked = true;
            action = spawn "playerctl" "previous";
          };
          "XF86AudioNext" = {
            allow-when-locked = true;
            action = spawn "playerctl" "next";
          };

          # System Actions
          # Lock through logind so hypridle's lock_cmd guard stops a second hyprlock.
          "Mod+Escape" = {
            allow-inhibiting = false;
            repeat = false;
            hotkey-overlay.title = "Lock Screen";
            action = spawn "loginctl" "lock-session";
          };
          "Mod+Ctrl+Escape" = {
            hotkey-overlay.title = "Toggle Shortcuts Inhibit";
            action = toggle-keyboard-shortcuts-inhibit;
          };
          "Mod+Shift+E".action = quit;
          "Mod+Shift+Slash".action = show-hotkey-overlay;
          "Mod+O" = {
            repeat = false;
            action = toggle-overview;
          };
          "Mod+B" = {
            repeat = false;
            hotkey-overlay.title = "Toggle Notification Center";
            action = niriQuickshellNotifications "toggle";
          };
          "Mod+I" = {
            repeat = false;
            hotkey-overlay.title = "Toggle Caffeine";
            action = spawn "quickshell" "ipc" "call" "quickshell-caffeine" "toggle";
          };

          # Launch
          "Mod+Space" = {
            repeat = false;
            hotkey-overlay.title = "Open Launcher";
            action = spawn "sh" "-c" "vicinae vicinae://toggle";
          };
          "Mod+Return" = {
            repeat = false;
            hotkey-overlay.title = "Open Terminal";
            action = spawn "ghostty";
          };
          "Mod+E" = {
            repeat = false;
            hotkey-overlay.title = "Open File Manager";
            action = spawn "nautilus";
          };
          "Mod+T" = {
            repeat = false;
            hotkey-overlay.title = "Open Browser";
            action = spawn "firefox";
          };
          "Mod+V" = {
            repeat = false;
            hotkey-overlay.title = "Clipboard History";
            action = spawn "sh" "-c" "vicinae vicinae://launch/clipboard/history";
          };

          # Window: Misc
          # Leave Mod+Tab and Alt+Tab unbound so niri's built-in recent-windows switcher handles them.
          "Mod+Q" = {
            repeat = false;
            action = close-window;
          };
          "Mod+F".action = maximize-column;
          "Mod+M" = {
            hotkey-overlay.title = "Maximize Window to Edges";
            action = maximize-window-to-edges;
          };
          "Mod+Ctrl+F" = {
            hotkey-overlay.title = "Expand Column to Available Width";
            action = expand-column-to-available-width;
          };
          "Mod+Shift+F" = {
            hotkey-overlay.title = "Fullscreen Window";
            action = fullscreen-window;
          };
          "Mod+Ctrl+Shift+F" = {
            hotkey-overlay.title = "Toggle Windowed Fullscreen";
            action = toggle-windowed-fullscreen;
          };
          "Mod+C".action = center-column;
          "Mod+Ctrl+C" = {
            hotkey-overlay.title = "Center Visible Columns";
            action = center-visible-columns;
          };
          "Mod+Shift+C".action = center-window;

          # Niri has no submaps. These keep the useful window-mode actions directly reachable.
          "Mod+Slash" = {
            repeat = false;
            hotkey-overlay.title = "Switch Windows";
            action = spawn "sh" "-c" "vicinae vicinae://launch/wm/switch-windows";
          };
          "Mod+Shift+Space".action = toggle-window-floating;
          "Mod+Shift+V".action = switch-focus-between-floating-and-tiling;
          "Mod+BracketLeft".action = consume-or-expel-window-left;
          "Mod+BracketRight".action = consume-or-expel-window-right;
          "Mod+Comma".action = consume-window-into-column;
          "Mod+Period".action = expel-window-from-column;
          "Mod+W" = {
            hotkey-overlay.title = "Toggle Tabbed Column";
            action = toggle-column-tabbed-display;
          };
          "Mod+R".action = switch-preset-column-width;
          "Mod+Shift+R".action = switch-preset-column-width-back;
          "Mod+Ctrl+R".action = reset-window-height;
          "Mod+Ctrl+Shift+R" = {
            hotkey-overlay.title = "Switch Preset Window Heights";
            action = switch-preset-window-height;
          };
          "Mod+Minus".action = set-column-width "-10%";
          "Mod+Equal".action = set-column-width "+10%";
          "Mod+Shift+Minus".action = set-window-height "-10%";
          "Mod+Shift+Equal".action = set-window-height "+10%";

          # Window: Focus
          "Mod+Ctrl+H".action = focus-column-first;
          "Mod+Ctrl+L".action = focus-column-last;
          "Mod+Home".action = focus-column-first;
          "Mod+End".action = focus-column-last;
          "Mod+H".action = focus-column-left;
          "Mod+J".action = focus-window-down;
          "Mod+K".action = focus-window-up;
          "Mod+L".action = focus-column-right;
          "Mod+Left".action = focus-column-left;
          "Mod+Down".action = focus-window-down;
          "Mod+Up".action = focus-window-up;
          "Mod+Right".action = focus-column-right;

          # Window: Move
          "Mod+Ctrl+Shift+H".action = move-column-to-first;
          "Mod+Ctrl+Shift+L".action = move-column-to-last;
          "Mod+Ctrl+Shift+Home".action = move-column-to-first;
          "Mod+Ctrl+Shift+End".action = move-column-to-last;
          "Mod+Shift+H".action = move-column-left;
          "Mod+Shift+J".action = move-window-down;
          "Mod+Shift+K".action = move-window-up;
          "Mod+Shift+L".action = move-column-right;
          "Mod+Shift+Left".action = move-column-left;
          "Mod+Shift+Down".action = move-window-down;
          "Mod+Shift+Up".action = move-window-up;
          "Mod+Shift+Right".action = move-column-right;

          # Scroll Navigation
          "Mod+WheelScrollDown" = {
            cooldown-ms = 150;
            action = focus-workspace-down;
          };
          "Mod+WheelScrollUp" = {
            cooldown-ms = 150;
            action = focus-workspace-up;
          };
          "Mod+WheelScrollRight".action = focus-column-right;
          "Mod+WheelScrollLeft".action = focus-column-left;
          # For wheels without horizontal scroll.
          "Mod+Shift+WheelScrollDown".action = focus-column-right;
          "Mod+Shift+WheelScrollUp".action = focus-column-left;

          # Workspace: Focus
          "Mod+N".action = focus-workspace-down;
          "Mod+P".action = focus-workspace-up;
          "Mod+Page_Down".action = focus-workspace-down;
          "Mod+Page_Up".action = focus-workspace-up;
          "Mod+Grave" = {
            hotkey-overlay.title = "Switch to Previous Workspace";
            action = focus-workspace-previous;
          };

          # Workspace: Move Window
          "Mod+Shift+N".action = move-window-to-workspace-down { focus = true; };
          "Mod+Shift+P".action = move-window-to-workspace-up { focus = true; };
          "Mod+Shift+Page_Down".action = move-window-to-workspace-down { focus = true; };
          "Mod+Shift+Page_Up".action = move-window-to-workspace-up { focus = true; };

          # Workspace: Move Column
          "Mod+Ctrl+N".action = move-column-to-workspace-down;
          "Mod+Ctrl+P".action = move-column-to-workspace-up;
          "Mod+Ctrl+Page_Down".action = move-column-to-workspace-down;
          "Mod+Ctrl+Page_Up".action = move-column-to-workspace-up;

          # Workspace: Reorder
          "Mod+Ctrl+Shift+N".action = move-workspace-down;
          "Mod+Ctrl+Shift+P".action = move-workspace-up;
          "Mod+Ctrl+Shift+Page_Down".action = move-workspace-down;
          "Mod+Ctrl+Shift+Page_Up".action = move-workspace-up;

          # Matches AeroSpace alt-shift-m.
          "Mod+Shift+M".action = move-workspace-to-monitor-next;

          # Monitor binds use Mod+Alt because bare Alt binds are global and take keys such as
          # Alt+Left and Alt+H from apps.

          # Monitor: Focus
          "Mod+Alt+H".action = focus-monitor-left;
          "Mod+Alt+J".action = focus-monitor-down;
          "Mod+Alt+K".action = focus-monitor-up;
          "Mod+Alt+L".action = focus-monitor-right;
          "Mod+Alt+Left".action = focus-monitor-left;
          "Mod+Alt+Down".action = focus-monitor-down;
          "Mod+Alt+Up".action = focus-monitor-up;
          "Mod+Alt+Right".action = focus-monitor-right;
          "Mod+Alt+N".action = focus-monitor-next;
          "Mod+Alt+P".action = focus-monitor-previous;

          # Monitor: Move Window
          "Mod+Alt+Shift+H".action = move-window-to-monitor-left;
          "Mod+Alt+Shift+J".action = move-window-to-monitor-down;
          "Mod+Alt+Shift+K".action = move-window-to-monitor-up;
          "Mod+Alt+Shift+L".action = move-window-to-monitor-right;
          "Mod+Alt+Shift+Left".action = move-window-to-monitor-left;
          "Mod+Alt+Shift+Down".action = move-window-to-monitor-down;
          "Mod+Alt+Shift+Up".action = move-window-to-monitor-up;
          "Mod+Alt+Shift+Right".action = move-window-to-monitor-right;
          "Mod+Alt+Shift+N".action = move-window-to-monitor-next;
          "Mod+Alt+Shift+P".action = move-window-to-monitor-previous;

          # Monitor: Move Column
          "Mod+Alt+Ctrl+H".action = move-column-to-monitor-left;
          "Mod+Alt+Ctrl+J".action = move-column-to-monitor-down;
          "Mod+Alt+Ctrl+K".action = move-column-to-monitor-up;
          "Mod+Alt+Ctrl+L".action = move-column-to-monitor-right;
          "Mod+Alt+Ctrl+Left".action = move-column-to-monitor-left;
          "Mod+Alt+Ctrl+Down".action = move-column-to-monitor-down;
          "Mod+Alt+Ctrl+Up".action = move-column-to-monitor-up;
          "Mod+Alt+Ctrl+Right".action = move-column-to-monitor-right;
          "Mod+Alt+Ctrl+N".action = move-column-to-monitor-next;
          "Mod+Alt+Ctrl+P".action = move-column-to-monitor-previous;

          # Monitor: Move Workspace
          "Mod+Alt+Ctrl+Shift+H".action = move-workspace-to-monitor-left;
          "Mod+Alt+Ctrl+Shift+J".action = move-workspace-to-monitor-down;
          "Mod+Alt+Ctrl+Shift+K".action = move-workspace-to-monitor-up;
          "Mod+Alt+Ctrl+Shift+L".action = move-workspace-to-monitor-right;
          "Mod+Alt+Ctrl+Shift+Left".action = move-workspace-to-monitor-left;
          "Mod+Alt+Ctrl+Shift+Down".action = move-workspace-to-monitor-down;
          "Mod+Alt+Ctrl+Shift+Up".action = move-workspace-to-monitor-up;
          "Mod+Alt+Ctrl+Shift+Right".action = move-workspace-to-monitor-right;
          "Mod+Alt+Ctrl+Shift+N".action = move-workspace-to-monitor-next;
          "Mod+Alt+Ctrl+Shift+P".action = move-workspace-to-monitor-previous;
        }
        // niriWorkspaceBinds;
    };
  };
}
