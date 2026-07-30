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
      #           set -g @agent-indicator-icons 'claude=✻,codex=,opencode=󰚩,default=󰆍'
      #           set -g @agent-indicator-notification-enabled 'off'
      #         '';
      #     }
      #   ];
      # }
      (lib.mkIf (config.programs.claude-code.enable) {
        programs.claude-code.hooks = {
          UserPromptSubmit =
            #bash
            ''
              #!/usr/bin/env bash

              "${agentStateScript}" --agent claude --state off
              "${agentStateScript}" --agent claude --state running
            '';
          PermissionRequest =
            #bash
            ''
              #!/usr/bin/env bash

              "${agentStateScript}" --agent claude --state needs-input
            '';
          Stop =
            #bash
            ''
              #!/usr/bin/env bash
              "${agentStateScript}" --agent claude --state done
            '';
        };
      })
      # (lib.mkIf (config.programs.codex.enable) {
      #   programs.codex.settings.notify = [
      #     "bash"
      #     "${pkgs.tmuxPlugins.agent-indicator}/share/tmux-plugins/agent-indicator/adapters/codex-notify.sh"
      #   ];
      # })
      (lib.mkIf (config.programs.opencode.enable) {
        xdg.configFile."opencode/plugins/opencode-tmux-agent-indicator.js".source =
          "${pkgs.tmuxPlugins.agent-indicator}/share/agent-indicator/opencode/plugins/opencode-tmux-agent-indicator.js";
      })
      (lib.mkIf (config.programs.pi-coding-agent.enable) {
        home.file."${config.programs.pi-coding-agent.configDir}/extensions/tmux-agent-indicator.ts".text =
          # typescript
          ''
            import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

            const AGENT_STATE = "${agentStateScript}";

            export default function (pi: ExtensionAPI) {
            	function setState(state: string) {
            		// agent-state.sh exits 0 outside tmux; ignore failures so pi
            		// sessions without tmux are unaffected.
            		return pi.exec(AGENT_STATE, ["--agent", "pi", "--state", state]).catch(() => {});
            	}

            	pi.on("agent_start", async () => {
            		await setState("off");
            		await setState("running");
            	});

            	pi.on("agent_end", async () => {
            		await setState("done");
            	});
            }
          '';
      })
    ]
  );
}
