{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  nodejs_24,
  pnpm_10,
  pnpmConfigHook,
  python3,
  pkg-config,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "openspecui";
  version = "0-unstable-2026-02-26";

  src = fetchFromGitHub {
    owner = "jixoai";
    repo = "openspecui";
    rev = "8bb14dd31287fc986fcf1c6e25b19ed6f534c5cd";
    hash = "sha256-8F2bsZ5fKKLFcauE78Isu+zvOSJrfD1qskC0XK2Q7HI=";
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-quKCVz/IY+LqSQS8kkfUlFj6t7ssNN0BJJCxGovOFro=";
  };

  nativeBuildInputs = [
    nodejs_24
    pnpmConfigHook
    pnpm_10
    python3
    pkg-config
  ];

  buildPhase = ''
    runHook preBuild
    pnpm run build
    runHook postBuild
  '';

  installPhase = ''
        runHook preInstall

        mkdir -p $out/lib
        mv node_modules $out/lib/
        mv packages $out/lib/

        mkdir -p $out/bin
        cat > $out/bin/openspecui <<EOF
    #!${stdenv.shell}
    exec ${nodejs_24}/bin/node ${placeholder "out"}/lib/packages/cli/dist/cli.mjs "\$@"
    EOF
        chmod +x $out/bin/openspecui

        runHook postInstall
  '';

  dontNpmBuild = true;
  dontNpmPrune = true;
  dontStrip = true;
  dontPatchShebangs = true;
  noAuditTmpdir = true;
  dontFixup = true;
  strictDeps = true;

  meta = with lib; {
    description = "Visual interface for spec-driven development";
    homepage = "https://github.com/jixoai/openspecui";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "openspecui";
  };
})
