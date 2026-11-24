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
  version = "1.4.272-unstable-2026-11-24";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "851d47776c9d8d9ef02b3b0ba1c9b43d0f0721cc";
    sparseCheckout = [ "skills" ];
    hash = "sha256-dEh3Xl8nboPUaAl6xmaMFz1q32UVAuTQoFyMRTMMOn4=";
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
