{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  python3,
}:
let
  # Agents that EGM skills define at runtime. Claude Code cannot do that, so
  # claude-agents.py generates them and stops the build when this list no
  # longer matches upstream.
  claudeRuntimeAgents = [ "goldfish-explorer" ];
in
stdenvNoCC.mkDerivation {
  pname = "elephant-goldfish-model";
  version = "0.1.1-unstable-2026-11-13";

  src = fetchFromGitHub {
    owner = "google";
    repo = "elephant-goldfish-model";
    rev = "270b10326bf366d823bc76fd662cf83808d5781e";
    hash = "sha256-wFSTyBZ/v8DZ4Fc+cVPT2O5dpG+4QVqCyp1EgiEwppc=";
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
    python3 ${./claude-agents.py} $out/share/elephant-goldfish-model \
      $out/share/claude-agents ${lib.escapeShellArgs claudeRuntimeAgents}

    runHook postInstall
  '';

  passthru = { inherit claudeRuntimeAgents; };

  meta = with lib; {
    description = "Open-source skills for designing and reviewing software with AI agents";
    homepage = "https://github.com/google/elephant-goldfish-model";
    license = licenses.asl20;
    maintainers = [ ];
  };
}
