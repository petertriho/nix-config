{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.2-unstable-2026-03-12";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "363923f74aa9cd7b470c0aaa73dee629a8bfdc90";
    sha256 = "sha256-AyRGXwWI9xHGeHw9vD64cnV19txR/lOtxudcHnbV75I=";
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
