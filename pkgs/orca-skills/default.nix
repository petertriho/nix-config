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
  version = "1.4.274-unstable-2026-11-25";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "ae3f1b058a5248416dad8bde2897e95842749a99";
    sparseCheckout = [ "skills" ];
    hash = "sha256-BUc27Ha/Y9g3vTKxIoYReoylzgMdA0kaw7egp1oTom8=";
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
