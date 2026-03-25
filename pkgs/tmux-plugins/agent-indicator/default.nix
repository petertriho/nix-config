{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
}:

tmuxPlugins.mkTmuxPlugin {
  pluginName = "agent-indicator";
  version = "0-unstable-2026-03-10";
  src = fetchFromGitHub {
    owner = "accessd";
    repo = "tmux-agent-indicator";
    rev = "566dda63be1f38efe40528c90c6076a589051df8";
    hash = "sha256-l5ceGR7JVKuiaGobPQyhON0jOjITf77zdWhs/sjk/uw=";
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
      --replace-fail 'pane="$done_candidate"' 'pane="%''${done_candidate}"'
    substituteInPlace scripts/session-dots.sh \
      --replace-fail 'tmux display-message -p -t "$pane_id"' 'tmux display-message -p -t "%''${pane_id}"'
  '';
  postInstall = ''
    mkdir -p $out/share/agent-indicator/opencode/plugins
    cp -r $src/plugins/* $out/share/agent-indicator/opencode/plugins/
  '';
}
