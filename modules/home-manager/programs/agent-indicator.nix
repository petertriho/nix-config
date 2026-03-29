{
  config,
  lib,
  pkgs,
  ...
}:
let
  agentStateScript = "${pkgs.tmuxPlugins.agent-indicator}/share/tmux-plugins/agent-indicator/scripts/agent-state.sh";
in
{
  options.programs.agent-indicator = {
    enable = lib.mkEnableOption "agent-indicator tmux plugin";
  };

  config = lib.mkIf (config.programs.agent-indicator.enable && config.programs.tmux.enable) (
    lib.mkMerge [
      # {
      #   programs.tmux.plugins = [
      #     {
      #       plugin = pkgs.tmuxPlugins.agent-indicator;
      #       extraConfig =
      #         # tmux
      #         ''
      #           set -g @agent-indicator-icons 'claude=󰚩,codex=󰅪,opencode=󰆍,default='
      #           set -g @agent-indicator-notification-enabled 'off'
      #         '';
      #     }
      #   ];
      # }
      (lib.mkIf (config.programs.claude-code.enable) {
        programs.claude-code.hooks = {
          UserPromptSubmit = ''
            "${agentStateScript}" --agent claude --state off
            "${agentStateScript}" --agent claude --state running
          '';
          PermissionRequest = ''
            "${agentStateScript}" --agent claude --state needs-input
          '';
          Stop = ''
            "${agentStateScript}" --agent claude --state done
          '';
        };
      })
      (lib.mkIf (config.programs.opencode.enable) {
        xdg.configFile."opencode/plugins/opencode-tmux-agent-indicator.js".source =
          "${pkgs.tmuxPlugins.agent-indicator}/share/agent-indicator/opencode/plugins/opencode-tmux-agent-indicator.js";
      })
    ]
  );
}
