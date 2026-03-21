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
  postInstall = ''
    mkdir -p $out/share/agent-indicator/opencode/plugins
    cp -r $src/plugins/* $out/share/agent-indicator/opencode/plugins/
  '';
}
