{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-04";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8";
    sha256 = "sha256-qOhU5bBnT6kI8c7i0r0IyecrgLJNNPlmQtAb6qWM73Q=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/mattpocock-skills
    cp -r . $out/share/mattpocock-skills/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Matt Pocock skills repository";
    homepage = "https://github.com/mattpocock/skills";
    maintainers = [ ];
  };
}
