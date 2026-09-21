{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "write-better";
  version = "0-unstable-2026-08-15";

  src = fetchFromGitHub {
    owner = "plannotator";
    repo = "write-better";
    rev = "8f0ed399053508e3f4abda0a58b91c5393f9c871";
    hash = "sha256-yuKlgPM1in3MXesURoq/75dnkbMIYlHBYchJQT7o7EU=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/write-better
    cp -r skills $out/share/write-better/

    runHook postInstall
  '';

  meta = with lib; {
    # Tracks upstream README.md line 1, `# Writing skills`.
    description = "Writing skills";
    homepage = "https://github.com/plannotator/write-better";
    license = licenses.mit;
    maintainers = [ ];
  };
}
