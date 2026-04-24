{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-04-23";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "5128e1865d670f5d6c9cef000e6dfc4e951fb5b9";
    sha256 = "sha256-xFsg66TCtKzSgRIW6Ab771FWEIhei3jPgfE4byMiB44=";
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
