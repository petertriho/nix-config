{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  version = "0.11.2-unstable-2026-03-08";

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "47bfc4bfd4b4709d1a90df7491e0009b6653a8b0";
    sha256 = "sha256-du02zQLcA3eW0P3zBASTfR1Z4cTbt1lln7NjLjvlFbQ=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/plannotator
    cp -r . $out/share/plannotator/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Visual plan review tool for AI coding agents";
    homepage = "https://github.com/backnotprop/plannotator";
    license = with licenses; [
      asl20
      mit
    ];
    maintainers = [ ];
  };
}
