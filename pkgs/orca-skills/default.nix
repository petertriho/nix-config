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
  version = "1.4.266-unstable-2026-11-20";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "f2d58c9bd1db14bff6c4b80ac245fd3ba7c8e47a";
    sparseCheckout = [ "skills" ];
    hash = "sha256-SDKYzrFPI8wI0PKmgrAxPq+37ypb0K4yS9uZBgZfEGI=";
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
