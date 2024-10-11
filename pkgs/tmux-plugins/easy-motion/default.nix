{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
  makeWrapper,
  pythonInputs,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "easy-motion";
  version = "unstable-2024-04-05";
  src = fetchFromGitHub {
    owner = "IngoMeyer441";
    repo = "tmux-easy-motion";
    rev = "3e2edbd0a3d9924cc1df3bd3529edc507bdf5934";
    sha256 = "1yxdz2l34mm49sns5l6cg46y80i6g1dbv7qj255sralfbnmhzqn0";
  };
  nativeBuildInputs = [ makeWrapper ];
  rtpFilePath = "easy_motion.tmux";
  postInstall = ''
    for f in easy_motion.tmux scripts/easy_motion.py; do
      wrapProgram $target/$f \
        --prefix PATH : ${lib.makeBinPath [ pythonInputs ]}
    done
  '';
}
