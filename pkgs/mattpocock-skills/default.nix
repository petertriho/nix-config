{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-18";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "67bce91c80cd1020a4f068ced32d0281656842ad";
    sha256 = "sha256-jyTajdFYJKoU2XBHi8rM/gsf/mg6s4oOvANVkh3jLU8=";
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
