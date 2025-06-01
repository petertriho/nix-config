{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-06-01";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "57d5f9683ff9a3b590643beeaf0364da819aedda";
    sha256 = "0gk7wpxb81ggxa5jmd53ir2fm5hwqmg72kinb9wq65rvp3ckahrq";
  };
}
