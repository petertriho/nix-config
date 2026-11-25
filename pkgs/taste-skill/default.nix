{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "taste-skill";
  version = "2.5.1-unstable-2026-11-24";

  src = fetchFromGitHub {
    owner = "Leonxlnx";
    repo = "taste-skill";
    rev = "d1a2bb41d927083ac7118f60cfc9cdf711810ea0";
    hash = "sha256-nQpL06PZ6UKhyFd7vdY1xaeB7lgwix4226VJcW0R1GQ=";
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
