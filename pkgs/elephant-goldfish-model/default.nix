{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  python3,
}:
stdenvNoCC.mkDerivation {
  pname = "elephant-goldfish-model";
  version = "0-unstable-2026-11-03";

  src = fetchFromGitHub {
    owner = "google";
    repo = "elephant-goldfish-model";
    rev = "113a3afc44e8f4f54722d7150d5701f65cc8ef7f";
    hash = "sha256-HZDDjVebpVxghkxrprdK07BbvDgbAVsNfStTqGjR/Uo=";
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
