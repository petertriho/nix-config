{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-05-17";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "6a5bb06904ab164a345e41c381fc9097954b83da";
    sha256 = "sha256-GytrPFxw1PC2B0MILR6eNa83qAmxcjvLPkJzHQXT93g=";
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
