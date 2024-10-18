{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2024-09-29";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "44fbe9034653c83a8ae68941aaeeeeb7503cd1ae";
    sha256 = "0d300q43zvj03jmrlk2v07rd2zi11ngc6jdyrk745a11jdai7qh0";
  };
}
