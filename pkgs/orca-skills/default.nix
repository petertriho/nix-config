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
  version = "1.4.262-unstable-2026-11-18";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "74b0f330c040d636bc66d13976f08058a2cbb557";
    sparseCheckout = [ "skills" ];
    hash = "sha256-MCp7zMK/F/U8YLq9Qvy/bNef8MbN7yQK9BFVQIoxxZM=";
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
