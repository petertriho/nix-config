{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "unstable-2026-03-10";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "5ef73d25b71e69e63a74eae359fb26c7a6ac8fc0";
    sha256 = "0yic5rq8fdrdr8vr5zl56cg2yxjxyhrc17ks2axn14blp426j42v";
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
