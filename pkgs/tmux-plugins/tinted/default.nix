{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-05-25";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "e96128685252e693f6943160cc6afbe4650c7d24";
    sha256 = "1hai8q5gyyzsbqqc79fckkbyaxsvlkpjwv8cm6kh8zn4zxrdrx5q";
  };
}
