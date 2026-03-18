{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "5.0.5-unstable-2026-03-17";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "7e516434f2a30114300efc9247db32fb37daa5f9";
    sha256 = "sha256-Yq7y6VDrREV60WpfaGsYdnWqoaS7g1hrtci4bGtgtZM=";
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
