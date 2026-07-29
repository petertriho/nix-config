{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "6.2.0-unstable-2026-07-28";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "44c9b2d6e889982ac18c27d05a19fefe335194e1";
    sha256 = "sha256-fnl+HbPL2qD5Zgz8a1NctjFJSqu6UsyHJAhQMLQNXXc=";
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
