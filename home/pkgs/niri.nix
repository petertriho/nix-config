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
          key = toString ws;
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
      ) 9
    )
  );
in
{
  imports = [
    inputs.niri.homeModules.niri
  ];

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

      # spawn-at-startup = [ { command = [ "waybar" ]; } ];

      prefer-no-csd = true;

      screenshot-path = "~/Pictures/Screenshots/Screenshot from %Y-%m-%d %H-%M-%S.png";

      binds =
        with niriActions;
        {
          # Missing Niri parity: Hyprland's custom touchpad gestures are not mirrored here.
          # Niri's Mod+left/right mouse move/resize gestures are built in, so no bind is needed.

          # System/Hardware Keys
          "Print".action = niriScreenshotArea;
          "Ctrl+Print".action.screenshot-screen = { };
          "Alt+Print".action.screenshot-window = { };
          "XF86AudioMute".action = niriQuickshellOsd "volumeMute";
          "XF86AudioLowerVolume".action = niriQuickshellOsd "volumeDown";
          "XF86AudioRaiseVolume".action = niriQuickshellOsd "volumeUp";
          "XF86MonBrightnessDown".action = niriQuickshellOsd "brightnessDown";
          "XF86MonBrightnessUp".action = niriQuickshellOsd "brightnessUp";
          "XF86AudioPlay".action = spawn "playerctl" "play-pause";
          "XF86AudioPrev".action = spawn "playerctl" "previous";
          "XF86AudioNext".action = spawn "playerctl" "next";

          # System Actions
          "Mod+Escape".action = spawn "hyprlock";
          "Mod+Shift+Escape".action = spawn "uwsm" "stop";
          "Mod+Shift+Slash".action = show-hotkey-overlay;
          "Mod+O" = {
            repeat = false;
            action = toggle-overview;
          };

          # Launch
          "Mod+Space".action = spawn "sh" "-c" "vicinae vicinae://toggle";
          "Mod+Return".action = spawn "ghostty";
          "Mod+F".action = spawn "dolphin";
          "Mod+T".action = spawn "floorp";
          "Mod+V".action = spawn "sh" "-c" "vicinae vicinae://extensions/vicinae/clipboard/history";

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
          "Mod+W".action = spawn "sh" "-c" "vicinae vicinae://extensions/vicinae/wm/switch-windows";
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

          # Workspace: Focus
          "Mod+N".action = focus-workspace-down;
          "Mod+P".action = focus-workspace-up;
          "Mod+0".action = focus-workspace-previous;

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
          "Mod+Shift+Alt+H".action = move-window-to-monitor-left;
          "Mod+Shift+Alt+J".action = move-window-to-monitor-down;
          "Mod+Shift+Alt+K".action = move-window-to-monitor-up;
          "Mod+Shift+Alt+L".action = move-window-to-monitor-right;
          "Mod+Shift+Alt+Left".action = move-window-to-monitor-left;
          "Mod+Shift+Alt+Down".action = move-window-to-monitor-down;
          "Mod+Shift+Alt+Up".action = move-window-to-monitor-up;
          "Mod+Shift+Alt+Right".action = move-window-to-monitor-right;
          "Mod+Shift+Alt+N".action = move-window-to-monitor-next;
          "Mod+Shift+Alt+P".action = move-window-to-monitor-previous;

          # Monitor: Move Column
          "Mod+Ctrl+Alt+H".action = move-column-to-monitor-left;
          "Mod+Ctrl+Alt+J".action = move-column-to-monitor-down;
          "Mod+Ctrl+Alt+K".action = move-column-to-monitor-up;
          "Mod+Ctrl+Alt+L".action = move-column-to-monitor-right;
          "Mod+Ctrl+Alt+Left".action = move-column-to-monitor-left;
          "Mod+Ctrl+Alt+Down".action = move-column-to-monitor-down;
          "Mod+Ctrl+Alt+Up".action = move-column-to-monitor-up;
          "Mod+Ctrl+Alt+Right".action = move-column-to-monitor-right;
          "Mod+Ctrl+Alt+N".action = move-column-to-monitor-next;
          "Mod+Ctrl+Alt+P".action = move-column-to-monitor-previous;

          # Monitor: Move Workspace
          "Mod+Ctrl+Shift+Alt+H".action = move-workspace-to-monitor-left;
          "Mod+Ctrl+Shift+Alt+J".action = move-workspace-to-monitor-down;
          "Mod+Ctrl+Shift+Alt+K".action = move-workspace-to-monitor-up;
          "Mod+Ctrl+Shift+Alt+L".action = move-workspace-to-monitor-right;
          "Mod+Ctrl+Shift+Alt+Left".action = move-workspace-to-monitor-left;
          "Mod+Ctrl+Shift+Alt+Down".action = move-workspace-to-monitor-down;
          "Mod+Ctrl+Shift+Alt+Up".action = move-workspace-to-monitor-up;
          "Mod+Ctrl+Shift+Alt+Right".action = move-workspace-to-monitor-right;
          "Mod+Ctrl+Shift+Alt+N".action = move-workspace-to-monitor-next;
          "Mod+Ctrl+Shift+Alt+P".action = move-workspace-to-monitor-previous;
        }
        // niriWorkspaceBinds;
    };
  };
}
