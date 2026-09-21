{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "taste-skill";
  version = "0-unstable-2026-09-20";

  src = fetchFromGitHub {
    owner = "Leonxlnx";
    repo = "taste-skill";
    rev = "5217fb45be2c0b302f29c9cd31cbd3237501c684";
    hash = "sha256-2NvFMN3Xtt4r6BDAXNM6nzeoqw6adUFKe0eCTkeN0bY=";
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
