{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.7-unstable-2026-04-30";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "e7a2d16476bf042e9add4699c9d018a90f86e4a6";
    sha256 = "sha256-8/M/S0BUYurZkFqe6LemVtBQnPSxBNfy1C7Q6f92hjE=";
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
