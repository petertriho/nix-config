{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin rec {
  pluginName = "tokyo-night";
  version = "unstable-2024-11-30";
  src = fetchFromGitHub {
    owner = "janoamaral";
    repo = "tokyo-night-tmux";
    rev = "d610ced20d5f602a7995854931440e4a1e0ab780";
    sha256 = "0pzrchfrjxay5lzmvwk7ixnv9v4hblzsaq2yzrlrs2zv8a1c9fyp";
  };
  rtpFilePath = "${pluginName}.tmux";
}
