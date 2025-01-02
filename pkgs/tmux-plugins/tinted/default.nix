{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-01-01";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "aead506a9930c717ebf81cc83a2126e9ca08fa64";
    sha256 = "00a7zplllbf1y207343m1p3b57gzvhiirkdc8r43kchr352a3v8l";
  };
}
