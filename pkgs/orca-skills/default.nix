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
  version = "1.4.259-unstable-2026-11-15";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "360233857aaa1525d25bc66c91f87415a35a009c";
    sparseCheckout = [ "skills" ];
    hash = "sha256-3d2Yc3NT/5RxXFjPfG4DvCPXIv/J4OpcebzdQOHVLDg=";
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
