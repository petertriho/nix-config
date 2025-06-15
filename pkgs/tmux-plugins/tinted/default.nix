{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-06-15";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "fdb4ca07a6ff223ccd437c56ecd9104dad79a06f";
    sha256 = "07r4lil4qfjg6f50fv49prj16w0hp7kg6g5l93l2hnh1gvivjqnd";
  };
}
