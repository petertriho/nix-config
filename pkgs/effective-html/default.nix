{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "effective-html";
  version = "0-unstable-2026-10-31";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "effective-html";
    rev = "e9e256e36270a359d0f6c89b3b33f41778ba6dce";
    hash = "sha256-oRbt61b4HeCfxen4BK5RQBih6gBviQjwUqasNejttWM=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/effective-html
    cp -r skills $out/share/effective-html/

    runHook postInstall
  '';

  meta = with lib; {
    description = "HTML design skills for AI coding agents";
    homepage = "https://github.com/plannotator/effective-html";
    license = licenses.mit;
    maintainers = [ ];
  };
}
