{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-03-02";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "d48ee86394cbe45b112ba23ab63e33656090edb4";
    sha256 = "059bz585jixi93nzhygb6hpl2bpbfry13pkzghqgmqs20xg04ryd";
  };
}
