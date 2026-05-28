{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-27";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "0288510dd61ff6ef7c2003834082ab8f2387e80e";
    sha256 = "sha256-XVT4fggiumXwGBO74JbscqMjHIUCMr3rAH0/ZXvBc5s=";
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
