{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin rec {
  pluginName = "tokyo-night";
  version = "unstable-2025-02-25";
  src = fetchFromGitHub {
    owner = "janoamaral";
    repo = "tokyo-night-tmux";
    rev = "caf6cbb4c3a32d716dfedc02bc63ec8cf238f632";
    sha256 = "0kd589277i45z03r3md2dmsnxa4598zxq0cbhb08jc44wgwvvr2c";
  };
  rtpFilePath = "${pluginName}.tmux";
}
