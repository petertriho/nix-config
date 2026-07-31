{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "effective-html";
  version = "0-unstable-2026-07-31";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "effective-html";
    rev = "4a9a1e563eba3e923fe8cbca00a75f734df12ba2";
    hash = "sha256-jlrsPKNfN5dQiuq2WB/i15P9vnsbovb6eX1TEMJdNtQ=";
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
