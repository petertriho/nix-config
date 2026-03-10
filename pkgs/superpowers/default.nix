{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "unstable-2026-03-09";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "33e55e60b2efcb69509bc233dfc128112012b2c8";
    sha256 = "1bxkx9345szv2f0fzxak8nb5657yvk00j381zjbgjv902wv1bvs5";
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
