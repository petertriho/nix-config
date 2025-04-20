{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-04-20";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "e009f18a01182b63559fb28f1c786eb027c3dee9";
    sha256 = "1773r4v4v8gj9fgxi3bxpfwyldh3xzdrmx6h4c4hkak9fyf7xmdr";
  };
}
