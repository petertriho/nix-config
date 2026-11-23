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
  version = "1.4.271-unstable-2026-11-23";

  src = fetchFromGitHub {
    owner = "stablyai";
    repo = "orca";
    rev = "4763c2fe8950195392a44c1d9d0c526a63ddfb9d";
    sparseCheckout = [ "skills" ];
    hash = "sha256-WaaZzh0QYpIDx6MuNynVkGMSq32rKCWDKzUoYLF0xDU=";
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
