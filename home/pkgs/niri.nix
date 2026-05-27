{
  config,
  inputs,
  pkgs,
  ...
}:
let
  niriActions = config.lib.niri.actions;
  niriQuickshellOsd = command: niriActions.spawn "quickshell" "ipc" "call" "quickshell-osd" command;
  niriScreenshotArea = niriActions.spawn "sh" "-c" ''grim -g "$(slurp)" - | wl-copy'';
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
in
{
  imports = [
    inputs.niri.homeModules.niri
  ];

  home.packages = [ pkgs.xwayland-satellite ];

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
          natural-scroll = true;
          drag = true;
        };
        # focus-follows-mouse.max-scroll-amount = "0%";
      };

      layout = {
        gaps = 0;
        center-focused-column = "on-overflow";
        background-color = "#1a1b26";
        preset-column-widths = [
          { proportion = 0.33333; }
          { proportion = 0.5; }
          { proportion = 0.66667; }
        ];
        default-column-width.proportion = 1.0;
      };

      spawn-at-startup = [ ];

      "xwayland-satellite".path = "xwayland-satellite";

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
          "Shift+Print".action = niriScreenshotArea;
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
          "XF86MonBrightnessDown".action = niriQuickshellOsd "brightnessDown";
          "XF86MonBrightnessUp".action = niriQuickshellOsd "brightnessUp";
          "XF86AudioPlay" = {
            allow-when-locked = true;
            action = spawn "playerctl" "play-pause";
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
          "Mod+Escape" = {
            allow-inhibiting = false;
            action = spawn "hyprlock";
          };
          "Mod+Ctrl+Escape".action = toggle-keyboard-shortcuts-inhibit;
          "Mod+Shift+Escape".action = quit;
          "Mod+Shift+Slash".action = show-hotkey-overlay;
          "Mod+O" = {
            repeat = false;
            action = toggle-overview;
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
          "Mod+F" = {
            repeat = false;
            hotkey-overlay.title = "Open File Manager";
            action = spawn "dolphin";
          };
          "Mod+T" = {
            repeat = false;
            hotkey-overlay.title = "Open Browser";
            action = spawn "floorp";
          };
          "Mod+V" = {
            repeat = false;
            hotkey-overlay.title = "Clipboard History";
            action = spawn "sh" "-c" "vicinae vicinae://launch/clipboard/history";
          };

          # Window: Misc
          "Mod+Tab".action = focus-column-right-or-first;
          "Mod+Shift+Tab".action = focus-column-left-or-last;
          "Mod+Q".action = close-window;
          "Mod+M".action = maximize-column;
          "Mod+Z".action = fullscreen-window;
          "Mod+Ctrl+Shift+F".action = toggle-windowed-fullscreen;
          "Mod+C".action = center-column;
          "Mod+Ctrl+C".action = center-visible-columns;
          "Mod+Shift+C".action = center-window;

          # Niri has no submaps. These keep the useful window-mode actions directly reachable.
          "Mod+W" = {
            repeat = false;
            hotkey-overlay.title = "Switch Windows";
            action = spawn "sh" "-c" "vicinae vicinae://launch/wm/switch-windows";
          };
          "Mod+Shift+F".action = toggle-window-floating;
          "Mod+Shift+V".action = switch-focus-between-floating-and-tiling;
          "Mod+BracketLeft".action = consume-or-expel-window-left;
          "Mod+BracketRight".action = consume-or-expel-window-right;
          "Mod+Comma".action = consume-window-into-column;
          "Mod+Period".action = expel-window-from-column;
          "Mod+Y".action = toggle-column-tabbed-display;
          "Mod+R".action = switch-preset-column-width;
          "Mod+Shift+R".action = switch-preset-column-width-back;
          "Mod+Ctrl+R".action = reset-window-height;
          "Mod+Ctrl+Shift+R".action = switch-preset-window-height;
          "Mod+Ctrl+O".action = toggle-window-rule-opacity;
          "Mod+Minus".action = set-column-width "-10%";
          "Mod+Equal".action = set-column-width "+10%";
          "Mod+Shift+Minus".action = set-window-height "-10%";
          "Mod+Shift+Equal".action = set-window-height "+10%";

          # Window: Focus
          "Mod+Ctrl+H".action = focus-column-first;
          "Mod+Ctrl+L".action = focus-column-last;
          "Mod+H".action = focus-column-left;
          "Mod+J".action = focus-window-down;
          "Mod+K".action = focus-window-up;
          "Mod+L".action = focus-column-right;
          "Mod+Left".action = focus-column-left;
          "Mod+Down".action = focus-window-down;
          "Mod+Up".action = focus-window-up;
          "Mod+Right".action = focus-column-right;

          # Window: Move
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

          # Workspace: Focus
          "Mod+N".action = focus-workspace-down;
          "Mod+P".action = focus-workspace-up;
          "Mod+Grave".action = focus-workspace-previous;

          # Workspace: Move Window
          "Mod+Shift+N".action = move-window-to-workspace-down { focus = true; };
          "Mod+Shift+P".action = move-window-to-workspace-up { focus = true; };

          # Workspace: Move Column
          "Mod+Ctrl+N".action = move-column-to-workspace-down;
          "Mod+Ctrl+P".action = move-column-to-workspace-up;

          # Workspace: Reorder
          "Mod+Ctrl+Shift+N".action = move-workspace-down;
          "Mod+Ctrl+Shift+P".action = move-workspace-up;

          # Monitor: Focus
          "Alt+H".action = focus-monitor-left;
          "Alt+J".action = focus-monitor-down;
          "Alt+K".action = focus-monitor-up;
          "Alt+L".action = focus-monitor-right;
          "Alt+Left".action = focus-monitor-left;
          "Alt+Down".action = focus-monitor-down;
          "Alt+Up".action = focus-monitor-up;
          "Alt+Right".action = focus-monitor-right;
          "Alt+N".action = focus-monitor-next;
          "Alt+P".action = focus-monitor-previous;

          # Monitor: Move Window
          "Alt+Shift+H".action = move-window-to-monitor-left;
          "Alt+Shift+J".action = move-window-to-monitor-down;
          "Alt+Shift+K".action = move-window-to-monitor-up;
          "Alt+Shift+L".action = move-window-to-monitor-right;
          "Alt+Shift+Left".action = move-window-to-monitor-left;
          "Alt+Shift+Down".action = move-window-to-monitor-down;
          "Alt+Shift+Up".action = move-window-to-monitor-up;
          "Alt+Shift+Right".action = move-window-to-monitor-right;
          "Alt+Shift+N".action = move-window-to-monitor-next;
          "Alt+Shift+P".action = move-window-to-monitor-previous;

          # Monitor: Move Column
          "Alt+Ctrl+H".action = move-column-to-monitor-left;
          "Alt+Ctrl+J".action = move-column-to-monitor-down;
          "Alt+Ctrl+K".action = move-column-to-monitor-up;
          "Alt+Ctrl+L".action = move-column-to-monitor-right;
          "Alt+Ctrl+Left".action = move-column-to-monitor-left;
          "Alt+Ctrl+Down".action = move-column-to-monitor-down;
          "Alt+Ctrl+Up".action = move-column-to-monitor-up;
          "Alt+Ctrl+Right".action = move-column-to-monitor-right;
          "Alt+Ctrl+N".action = move-column-to-monitor-next;
          "Alt+Ctrl+P".action = move-column-to-monitor-previous;

          # Monitor: Move Workspace
          "Alt+Ctrl+Shift+H".action = move-workspace-to-monitor-left;
          "Alt+Ctrl+Shift+J".action = move-workspace-to-monitor-down;
          "Alt+Ctrl+Shift+K".action = move-workspace-to-monitor-up;
          "Alt+Ctrl+Shift+L".action = move-workspace-to-monitor-right;
          "Alt+Ctrl+Shift+Left".action = move-workspace-to-monitor-left;
          "Alt+Ctrl+Shift+Down".action = move-workspace-to-monitor-down;
          "Alt+Ctrl+Shift+Up".action = move-workspace-to-monitor-up;
          "Alt+Ctrl+Shift+Right".action = move-workspace-to-monitor-right;
          "Alt+Shift+M".action = move-workspace-to-monitor-next;
          "Alt+Ctrl+Shift+N".action = move-workspace-to-monitor-next;
          "Alt+Ctrl+Shift+P".action = move-workspace-to-monitor-previous;
        }
        // niriWorkspaceBinds;
    };
  };
}
