{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-08-13";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "f6656c1256d5a8adfa37db9110046ef20bac644c";
    sha256 = "sha256-5/0f5AnGWX3oM+M9Xm/zSmooz11+S1YRdFPmAX+DXi0=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/anthropic-skills
    cp -r . $out/share/anthropic-skills/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Anthropic skills repository";
    homepage = "https://github.com/anthropics/skills";
    license = licenses.mit;
    maintainers = [ ];
  };
}
