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
  version = "unstable-2025-07-11";
  src = fetchFromGitHub {
    owner = "IngoMeyer441";
    repo = "tmux-easy-motion";
    rev = "8dfe8aee14c938ec170b3f98ca341055cc960d06";
    sha256 = "1ancs21xy609k730cg1glpfv7sgkxwbiwaqmmr1bypr0diykq6ip";
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
