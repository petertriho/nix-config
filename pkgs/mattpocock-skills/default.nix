{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-28";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "e3b90b5238f38cdea5996e16861dcae28ef52eda";
    sha256 = "sha256-RRVV4V4h/9GkwnHU4G4PLQtwdU1Lm4istvGncwmQ9dg=";
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
