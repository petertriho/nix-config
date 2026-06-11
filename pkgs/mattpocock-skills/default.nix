{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-06-10";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "694fa30311e02c2639942308513555e61ee84a6f";
    sha256 = "sha256-NGRKdnHSBKoR48zGotmJ3zGXnQ58ogudv8T4Va/2DSY=";
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
