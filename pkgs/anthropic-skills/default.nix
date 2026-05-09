{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-05-09";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "f458cee31a7577a47ba0c9a101976fa599385174";
    sha256 = "sha256-jKNYFom6R+Qw7LQ8vFPBe51JpqIP0tTSY8LM4aPlnT4=";
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
