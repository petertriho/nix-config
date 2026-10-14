{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "taste-skill";
  version = "2.0.0-unstable-2026-10-13";

  src = fetchFromGitHub {
    owner = "Leonxlnx";
    repo = "taste-skill";
    rev = "a60a36dc2bb3bb77ccf17f2f62041f5ca8a458b9";
    hash = "sha256-3ggZ+1nUIGZpzm8KPd8MDVVoSdGEsXmGlk7vPLsJtAE=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/taste-skill
    cp -r . $out/share/taste-skill/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Anti-slop frontend skills for AI agents";
    homepage = "https://github.com/Leonxlnx/taste-skill";
    license = licenses.mit;
    maintainers = [ ];
  };
}
