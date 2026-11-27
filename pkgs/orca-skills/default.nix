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
  version = "1.4.279-unstable-2026-11-27";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "0835b83d2a2c8aa93dd1c468a3d1d345e4bcd425";
    sparseCheckout = [ "skills" ];
    hash = "sha256-LWllonmTsoSPF3H2O0CphxlgJs8+V/HkRxLuPQlOD6E=";
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
