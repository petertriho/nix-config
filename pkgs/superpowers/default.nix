{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.7-unstable-2026-03-31";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "dd237283dbfe466e11bd4be55acf14ecb8f6636e";
    sha256 = "sha256-c2BfYwqPcg7XwhVC15fZ/anr5yNUvVavN8G6gazSBM8=";
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
