{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.5-unstable-2026-03-19";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "8ea39819eed74fe2a0338e71789f06b30e953041";
    sha256 = "sha256-wmOArGgOahJK/mqzYJZW6qcUNaOB6yL57RQMe56S1uw=";
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
