{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-05-06";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "d211d437443a7b2496a3dad9575e7dddd724c585";
    sha256 = "sha256-5NGI0gojBGoXXus8CPhIrigyWSEYJg8gnCzWYl6PsLA=";
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
