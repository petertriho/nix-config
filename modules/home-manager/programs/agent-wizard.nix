{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.agent-wizard;
  integrations = "${cfg.package.taw}/share/tmux-agent-wizard/integrations";

  # Mirrors upstream's `hook_entry` in src/integration/{claude,codex}.rs, which
  # `taw integration status` looks for. Recheck both after each update.
  sessionStartHook = command: {
    type = "command";
    inherit command;
    timeout = 10;
  };
  codexScript = ".codex/taw-agent-state.sh";
in
{
  options.programs.agent-wizard = {
    enable = lib.mkEnableOption "tmux-agent-wizard agent integrations";
    package = lib.mkPackageOption pkgs.tmuxPlugins "agent-wizard" {
      pkgsText = "pkgs.tmuxPlugins";
    };
  };

  # The tmux plugin entry itself stays in home/programs/tmux.nix, where the
  # plugin load order is set.
  config = lib.mkIf (cfg.enable && config.programs.tmux.enable) (
    lib.mkMerge [
      {
        home.packages = [ cfg.package.taw ];
        # `taw machine add` replaces this link with a regular file, so edit the
        # dotfile by hand instead.
        xdg.configFile."tmux-agent-wizard/config.toml".source =
          config.lib.meta.mkDotfilesSymlink "tmux-agent-wizard/.config/tmux-agent-wizard/config.toml";

        # Every harness runs a taw hook, so these grants are shared. Each hook
        # writes the pane's report into the state dir; the config is an
        # out-of-store symlink that no agent profile would otherwise reach.
        programs.nono.sharedFilesystem = {
          allow = [ "$HOME/.local/state/tmux-agent-wizard" ];
          read_file = [ "$HOME/.config/tmux-agent-wizard/config.toml" ];
        };
      }
      (lib.mkIf config.programs.claude-code.enable {
        home.file.".claude/hooks/taw-agent-state.sh".source = "${integrations}/claude/taw-agent-state.sh";
        programs.claude-code.settings.hooks.SessionStart = [
          {
            matcher = "^(startup|resume|clear|compact|fork)$";
            # The hook writes a temp file under ${TMPDIR:-/tmp} and exits 0 if
            # it cannot. The nono Claude profile leaves TMPDIR unset and can
            # write only Claude's own /tmp/claude-$UID.
            hooks = [
              (sessionStartHook ''d="''${TMPDIR:-/tmp/claude-$(id -u)}"; mkdir -m 700 -p "$d" 2>/dev/null; TMPDIR="$d" bash "$HOME/.claude/hooks/taw-agent-state.sh" session'')
            ];
          }
        ];
      })
      (lib.mkIf config.programs.codex.enable {
        home.file.${codexScript}.source = "${integrations}/codex/taw-agent-state.sh";
        programs.codex = {
          settings.features.hooks = true;
          hooks.SessionStart = [
            {
              hooks = [
                (sessionStartHook "bash '${config.home.homeDirectory}/${codexScript}' session")
              ];
            }
          ];
        };
      })
      # OpenCode 1 only: OpenCode 2 loads the TUI plugin from the mutable cli.json.
      (lib.mkIf config.programs.opencode.enable {
        xdg.configFile = {
          "opencode/plugins/taw-agent-state.js".source = "${integrations}/opencode/taw-agent-state.js";
          "opencode/taw-tui-session.js".source = "${integrations}/opencode/taw-tui-session.js";
        };
        programs.opencode.tui.plugin = [ "./taw-tui-session.js" ];
      })
      (lib.mkIf config.programs.pi-coding-agent.enable {
        home.file."${config.programs.pi-coding-agent.configDir}/extensions/taw-agent-state.ts".source =
          "${integrations}/pi/taw-agent-state.ts";
      })
    ]
  );
}
