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
  version = "1.4.261-unstable-2026-11-17";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "8abbc914ef5f7a4d06d014d9c05ad3db6fc54fd7";
    sparseCheckout = [ "skills" ];
    hash = "sha256-lGrzd0CEZ0zbGUgvQCmxqCWbefa5ZNG+89JsPPF31ho=";
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
