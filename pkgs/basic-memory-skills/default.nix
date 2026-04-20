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
    rev = "6d2b1d426d0dacf020aef45f029768c9d8c1e5e5";
    sha256 = "sha256-WGcBSfNcm4QCOA3n1fDHyI1+tYrW9TQoeCyv45vwkv4=";
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
