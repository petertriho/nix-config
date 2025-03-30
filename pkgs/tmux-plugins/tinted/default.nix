{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-03-30";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "af5152c8d7546dfb4ff6df94080bf5ff54f64e3a";
    sha256 = "0dhppf68lm5gljfpsmzzvwwg87kwplrqljh76fqi8f7mnsb2x17h";
  };
}
