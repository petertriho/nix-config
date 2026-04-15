{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.7-unstable-2026-04-14";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "f9b088f7b3a6fe9d9a9a98e392ad13c9d47053a4";
    sha256 = "sha256-Nbfzvd7h7KrO9OW7W3DdUgDkQW11xSfZylFXLWJ8J5I=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/superpowers
    cp -r . $out/share/superpowers/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Agentic skills framework and software development methodology";
    homepage = "https://github.com/obra/superpowers";
    license = licenses.mit;
    maintainers = [ ];
  };
}
