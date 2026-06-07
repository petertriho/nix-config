{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-06-06";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "be55a7970319ede7965edbb02b5e41cba1ca82c9";
    sha256 = "sha256-7CjfMl1xwTIiz2wPxikV+f84r3f9xKm/BC+cJ3Gfzcw=";
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
