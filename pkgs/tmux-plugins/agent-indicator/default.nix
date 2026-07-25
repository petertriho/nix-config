{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
}:

tmuxPlugins.mkTmuxPlugin {
  pluginName = "agent-indicator";
  version = "0-unstable-2026-07-25";
  src = fetchFromGitHub {
    owner = "accessd";
    repo = "tmux-agent-indicator";
    rev = "be4c35324fe79300f1861574113d56126a0baace";
    hash = "sha256-Cguan8MKnZZa44Eyl958bF/7dk7PGdI/Wc41Qkd0IdM=";
  };
  rtpFilePath = "agent-indicator.tmux";
  postPatch = ''
    for script in scripts/agent-state.sh scripts/pane-focus-in.sh; do
      substituteInPlace "$script" \
        --replace-fail 'TMUX_AGENT_PANE_''${pane_id}_' 'TMUX_AGENT_PANE_''${pane_id/#%/}_' \
        --replace-fail 'TMUX_AGENT_WINDOW_''${window_id}_' 'TMUX_AGENT_WINDOW_''${window_id/#@/}_'
    done
    substituteInPlace scripts/reset_all.sh \
      --replace-fail 'TMUX_AGENT_WINDOW_''${window_id}_' 'TMUX_AGENT_WINDOW_''${window_id/#@/}_'
    substituteInPlace scripts/pane-focus-in.sh \
      --replace-fail 'TMUX_AGENT_WINDOW_''${done_window}_' 'TMUX_AGENT_WINDOW_''${done_window/#@/}_'
    substituteInPlace scripts/indicator.sh \
      --replace-fail 'TMUX_AGENT_PANE_''${PANE_ID}_' 'TMUX_AGENT_PANE_''${PANE_ID/#%/}_' \
      --replace-fail 'TMUX_AGENT_PANE_''${other_pane}_' 'TMUX_AGENT_PANE_''${other_pane/#%/}_'
    substituteInPlace scripts/agent-state.sh \
      --replace-fail 'pane_exists "$pane_candidate"' 'pane_exists "%''${pane_candidate}"' \
      --replace-fail 'pane="$running_candidate"' 'pane="%''${running_candidate}"' \
      --replace-fail 'pane="$done_candidate"' 'pane="%''${done_candidate}"' \
      --replace-fail 'TMUX_AGENT_SESSION_SEEN_''${pane_session}' 'TMUX_AGENT_SESSION_SEEN_''${pane_session//[^a-zA-Z0-9_]/_}'
    substituteInPlace scripts/session-dots.sh \
      --replace-fail 'tmux display-message -p -t "$pane_id"' 'tmux display-message -p -t "%''${pane_id}"' \
      --replace-fail 'attention_sessions["$session"]=1' 'attention_sessions["''${session//[^a-zA-Z0-9_]/_}"]=1' \
      --replace-fail 'attention_sessions[$session]' 'attention_sessions[''${session//[^a-zA-Z0-9_]/_}]' \
      --replace-fail 'TMUX_AGENT_SESSION_SEEN_''${session}' 'TMUX_AGENT_SESSION_SEEN_''${session//[^a-zA-Z0-9_]/_}'
    substituteInPlace scripts/session-changed.sh \
      --replace-fail 'TMUX_AGENT_SESSION_SEEN_''${prev}' 'TMUX_AGENT_SESSION_SEEN_''${prev//[^a-zA-Z0-9_]/_}'
  '';
  postInstall = ''
    mkdir -p $out/share/agent-indicator/opencode/plugins
    cp -r $src/plugins/* $out/share/agent-indicator/opencode/plugins/
  '';
}
