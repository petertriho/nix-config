{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "taste-skill";
  version = "2.5.1-unstable-2026-11-07";

  src = fetchFromGitHub {
    owner = "Leonxlnx";
    repo = "taste-skill";
    rev = "f6b76575f949707b4e3c37cd86cb44b0b98643e8";
    hash = "sha256-7w2pcrS5g3ACXiAoJL3oe+hiVy+aDmUnx3PxeRZ9rVg=";
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
