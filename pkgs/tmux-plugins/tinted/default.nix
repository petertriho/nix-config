{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-04-13";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "7259a5327d1a5a463d7660a1fd4c73afb3da71c7";
    sha256 = "0ip0jyy9dbc2wlm6b7v3czxp8y3pig3vqnhaxnp5ll59pzsnahr0";
  };
}
