{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "effective-html";
  version = "0-unstable-2026-09-14";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "effective-html";
    rev = "2ac1dfecb0f2474e75260cb6d3c9b9d6d9b5062e";
    hash = "sha256-i3b2AN6WnQFKW8csvPYYsY/IyjwsTtRKN9k6VF9fS18=";
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
