{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "basic-memory-skills";
  version = "0-unstable-2026-04-19";

  src = fetchFromGitHub {
    owner = "basicmachines-co";
    repo = "basic-memory-skills";
    rev = "8117b8af81eb75675fed2146014f6ec599388c00";
    sha256 = "sha256-24LWo1N3atZjG0hHH7n7rdnzlYL8kryUGO/jM3euoJE=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/basic-memory-skills
    cp -r . $out/share/basic-memory-skills/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Basic Memory skills repository";
    homepage = "https://github.com/basicmachines-co/basic-memory-skills";
    maintainers = [ ];
  };
}
