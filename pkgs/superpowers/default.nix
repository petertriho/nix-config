{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.4-unstable-2026-03-17";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "3cee13e516e91d44b957c1336c3d08c8a8392702";
    sha256 = "sha256-X4heQM1YjE7m4licqZ/6yJrpq5eIJNMIuQJ1C1XP1FM=";
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
