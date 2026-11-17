{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "terraform-skill";
  version = "1.18.0-unstable-2026-11-16";

  src = fetchFromGitHub {
    owner = "antonbabenko";
    repo = "terraform-skill";
    rev = "a04a4c4acaa02a04d42e604beaf875ab263417de";
    hash = "sha256-/mon5QT6nB8AzFhyE/DQnUSTGbUd3lHlQasz6dTOUR4=";
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
