{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  python3,
}:
stdenvNoCC.mkDerivation {
  pname = "elephant-goldfish-model";
  version = "0.1.0-unstable-2026-11-05";

  src = fetchFromGitHub {
    owner = "google";
    repo = "elephant-goldfish-model";
    rev = "6a8001ea31ccf72430ba0603a467ec6df9f69dd7";
    hash = "sha256-rmpr2rNXCxUouzc2/r9e7F/KVnm2Kbda8JSvfYKxgfM=";
  };

  nativeBuildInputs = [ python3 ];

  dontConfigure = true;

  # Upstream's packer copies only runtime files and fails if a required
  # persona, standard, or skill file is missing. It refuses an output folder
  # inside the source tree, so write to $TMPDIR.
  buildPhase = ''
    runHook preBuild

    python3 scripts/pack_plugin.py --target claude --output "$TMPDIR/egm-runtime"

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -d $out/share
    cp -r "$TMPDIR/egm-runtime/egm-claude" $out/share/elephant-goldfish-model

    runHook postInstall
  '';

  meta = with lib; {
    description = "Open-source skills for designing and reviewing software with AI agents";
    homepage = "https://github.com/google/elephant-goldfish-model";
    license = licenses.asl20;
    maintainers = [ ];
  };
}
