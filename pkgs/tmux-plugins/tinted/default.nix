{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-06-08";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "e77f752cfbc2db3902d8d36e0c6e71979e3e556d";
    sha256 = "0awclrgr79n9pkdjhlg155nx59h2hzxdhff7xn9szf48xs4m2giy";
  };
}
