{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "7.0.0-unstable-2026-10-10";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "bb92a77741419a4ab5f06e711a283343f1ada0c3";
    sha256 = "sha256-UCVI+T7j1Xh1LDkrvnJduis7eHFqrizCyGTWAGW5d6U=";
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
