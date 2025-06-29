{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-06-29";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "bded5e24407cec9d01bd47a317d15b9223a1546c";
    sha256 = "1cfwvnfsx0yrhiv9h47608r53xqfvb0k97grphrq2770awvw3qah";
  };
}
