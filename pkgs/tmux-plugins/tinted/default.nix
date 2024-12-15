{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2024-12-15";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "20396f130e477512632c37f72590b71f59dbef88";
    sha256 = "1hl86fb7c8vg87y33ffs39x8070q2jzpxa09ray2lqcp6bvxlbyp";
  };
}
