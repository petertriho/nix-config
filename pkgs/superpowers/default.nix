{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.7-unstable-2026-04-02";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "b7a8f76985f1e93e75dd2f2a3b424dc731bd9d37";
    sha256 = "sha256-hGEMwmSojy3cNtUQvB5djExlD39O2dwcnLOMUNaVIHg=";
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
