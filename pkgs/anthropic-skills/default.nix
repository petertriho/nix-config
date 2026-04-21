{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-04-20";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "b9e19e6f44773509fbdd7001d77ff41a49a486c1";
    sha256 = "sha256-qAhHPjh7kgqx0oj8r2SPTPp/BamShae0f/9gbrUePCY=";
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
