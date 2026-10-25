{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "terraform-skill";
  version = "1.17.2-unstable-2026-10-24";

  src = fetchFromGitHub {
    owner = "antonbabenko";
    repo = "terraform-skill";
    rev = "9c1e92d962a5407c227e5566416e962a2f057240";
    hash = "sha256-TiE4DuLJpU8khL1h+MCvwj+zhBpsJQK5pReQWIraFNs=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/terraform-skill
    cp -r skills $out/share/terraform-skill/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Terraform and OpenTofu skill for AI agents";
    homepage = "https://github.com/antonbabenko/terraform-skill";
    license = licenses.asl20;
    maintainers = [ ];
  };
}
