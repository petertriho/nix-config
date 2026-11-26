{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
# The Orca app compiles its skill stubs into JavaScript, so read the published
# stubs from the upstream source instead. Each stub only tells the agent to
# load a guide from the installed `orca` binary, so a stub that is newer than
# the app still works.
stdenvNoCC.mkDerivation {
  pname = "orca-skills";
  version = "1.4.277-unstable-2026-11-26";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "284bf8425a0a518225c81becdaf0023d52fa5d1e";
    sparseCheckout = [ "skills" ];
    hash = "sha256-gmEPeyGIz4SV4X3XAW0ehr6W5bhKNAPEdvkhtmLT4CI=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/orca
    cp -r skills $out/share/orca/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Agent skill stubs for Orca, the agent development environment";
    homepage = "https://github.com/stablyai/orca";
    license = licenses.mit;
    maintainers = [ ];
  };
}
