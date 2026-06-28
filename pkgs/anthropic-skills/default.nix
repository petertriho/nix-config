{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-06-27";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "35414756ca55738e050562e272a6bbc6273aa926";
    sha256 = "sha256-7JB/zj2rBFdvbbFuGIFDXnm1TN26E67fRO1deQvzs34=";
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
