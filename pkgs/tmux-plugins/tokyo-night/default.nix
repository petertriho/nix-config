{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin rec {
  pluginName = "tokyo-night";
  version = "unstable-2024-06-30";
  src = fetchFromGitHub {
    owner = "janoamaral";
    repo = "tokyo-night-tmux";
    rev = "b45b742eb3fdc01983c21b1763594b549124d065";
    sha256 = "0dfn84ywjvvrpf49921r8np0mi8hrq9bgwny9yzvk4vjcxyrp04k";
  };
  rtpFilePath = "${pluginName}.tmux";
}
