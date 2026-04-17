{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-04-16";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "2c7ec5e78b8e5d43ea02e90bb8826f6b9f147b0c";
    sha256 = "sha256-BMgH43diojdUrGC6ivk87eEm2W1yWNuh2fpR9JpbUnE=";
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
