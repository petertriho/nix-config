{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-06-11";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "bb583b6f0110624be5fcd53462bc111e0ba7f9ea";
    sha256 = "1ahk8nfpx63zrdffbky7pm30nhk44j0qj7hc1s2b7sh36lg3zw61";
  };
}
