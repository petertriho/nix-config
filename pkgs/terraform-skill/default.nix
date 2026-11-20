{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "terraform-skill";
  version = "1.18.2-unstable-2026-11-19";

  src = fetchFromGitHub {
    owner = "antonbabenko";
    repo = "terraform-skill";
    rev = "f5a195992d84c8fb075b0176d666967cd07d2081";
    hash = "sha256-Y3IvVKo9aVxKyFyZHif+Z96dOgGIXQ8YJIjkUTuTxgM=";
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
