{
  tmuxPlugins,
  replaceVars,
  fetchFromGitHub,
  crystal,
}:
let
  fingers = crystal.buildCrystalPackage rec {
    format = "shards";
    version = "2.6.0-unstable-2026-01-05";
    pname = "fingers";
    src = fetchFromGitHub {
      owner = "Morantron";
      repo = "tmux-fingers";
      rev = "56d447282dc5d5c0624397019aba1bf1bb9fb0ed";
      sha256 = "1i86rygp7lz33izhwqcs898zw4i5bln8zpvblilagk71d1qh7zhh";
    };

    shardsFile = ./shards.nix;
    crystalBinaries.tmux-fingers.src = "src/fingers.cr";

    postInstall = ''
      shopt -s dotglob extglob
      rm -rv !("tmux-fingers.tmux"|"bin")
      shopt -u dotglob extglob
    '';

    # TODO: Needs starting a TMUX session to run tests
    # Unhandled exception: Missing ENV key: "TMUX" (KeyError)
    doCheck = false;
    doInstallCheck = false;
  };
in
tmuxPlugins.mkTmuxPlugin {
  inherit (fingers) version src meta;

  pluginName = fingers.src.repo;
  rtpFilePath = "tmux-fingers.tmux";

  patches = [
    (replaceVars ./fix.patch {
      tmuxFingersDir = "${fingers}/bin";
    })
  ];
}
