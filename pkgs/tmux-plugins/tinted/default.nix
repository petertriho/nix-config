{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-08-03";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "15abe8934d7a47aff19b437a68700e3af748f96e";
    sha256 = "007pv4h8i7mcsigj198izdnvrr746xdnfbrrclx9kqk3xs6xzpj5";
  };
}
