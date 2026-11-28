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
  version = "1.4.280-unstable-2026-11-28";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "efd519f198b4b065e2952e760c3e98e9a2e45044";
    sparseCheckout = [ "skills" ];
    hash = "sha256-4B9qAMvwvN2VrHJkoSecE8/1Z2lQpVo/ZgZRU1CNvok=";
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
