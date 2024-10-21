{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2024-10-21";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "f0e7f7974a6441033eb0a172a0342e96722b4f14";
    sha256 = "17mpv0s60kakhh1iwnsn67c6azfcwdlwar3zjxkykpdnq0a4926n";
  };
}
