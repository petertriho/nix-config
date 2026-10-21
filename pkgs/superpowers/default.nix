{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "7.0.0-unstable-2026-10-20";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "b739a8af570e10a95898f2bdf6cec97467fa6c12";
    sha256 = "sha256-hy6aavA88hoqdUsV7vCTa0nV4YooZDSBPPPX6Jb7ZCs=";
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
