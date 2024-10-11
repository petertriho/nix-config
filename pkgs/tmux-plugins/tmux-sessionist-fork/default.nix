{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "sessionist";
  version = "unstable-2023-06-14";
  src = fetchFromGitHub {
    owner = "petertriho";
    repo = "tmux-sessionist";
    rev = "71267aa8cd625f97772af8ffd8d98efd5aa01736";
    sha256 = "0zq37jwxp9yhlkq7gkfpqwyx00sfb89wpwhrhl3ymirj8bx2wyh6";
  };
}
