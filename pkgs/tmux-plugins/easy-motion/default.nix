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
  version = "unstable-2026-07-16";
  src = fetchFromGitHub {
    owner = "IngoMeyer441";
    repo = "tmux-easy-motion";
    rev = "1a1aca6ed82b6b02dbfee99e0125540b6f590743";
    sha256 = "0ajdhnxfxvl3wq0iaw8fwb1q3ymm7wapl5ar4g9d389r0xflh57i";
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
