{
  stdenvNoCC,
  stdenv,
  fetchFromGitHub,
  lib,
  bun,
  makeWrapper,
  cacert,
}:
let
  node-modules-hash = {
    "aarch64-darwin" = "sha256-ugcvH2ACeA0U4Zfa4eWmTXmoubHbn6wzs667YauSNWY=";
    "aarch64-linux" = "sha256-QC4D4etRuO9PuPY2gJZV2CzagL4mkCAaN3nitUm4bbM=";
    "x86_64-darwin" = "sha256-ugcvH2ACeA0U4Zfa4eWmTXmoubHbn6wzs667YauSNWY=";
    "x86_64-linux" = "sha256-QC4D4etRuO9PuPY2gJZV2CzagL4mkCAaN3nitUm4bbM=";
  };
  # Fixed-output derivation for node_modules
  bunDeps = stdenv.mkDerivation {
    pname = "ccusage-bun-deps";
    version = "15.9.7-unstable-2025-08-17";

    src = fetchFromGitHub {
      owner = "ryoppippi";
      repo = "ccusage";
      rev = "53f75ee11a66b4606dd59ea4fa2bb020127c4068";
      sha256 = "sha256-LIyRos+VUTEct8bsWpeelX3ad5N36SjhS3LeSEYqIQc=";
    };

    nativeBuildInputs = [
      bun
      cacert
    ];

    configurePhase = ''
      export HOME=$TMPDIR
      export BUN_INSTALL_CACHE_DIR=$TMPDIR/.bun-cache
      export SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt
    '';

    buildPhase = ''
      bun install --frozen-lockfile --no-save --ignore-scripts
    '';

    installPhase = ''
      mkdir -p $out
      cp -r node_modules $out/
      cp bun.lock $out/

      # Remove broken symlinks
      find $out -type l -exec test ! -e {} \; -delete
    '';

    dontPatchShebangs = true;
    dontStrip = true;

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = node-modules-hash.${stdenvNoCC.hostPlatform.system};
  };
in
stdenv.mkDerivation rec {
  pname = "ccusage";
  version = "16.2.0-unstable-2025-08-23";

  src = fetchFromGitHub {
    owner = "ryoppippi";
    repo = "ccusage";
    rev = "53f75ee11a66b4606dd59ea4fa2bb020127c4068";
    sha256 = "sha256-LIyRos+VUTEct8bsWpeelX3ad5N36SjhS3LeSEYqIQc=";
  };

  nativeBuildInputs = [
    bun
    makeWrapper
  ];

  dontConfigure = true;

  buildPhase = ''
    runHook preBuild

    # Copy pre-built node_modules
    cp -r ${bunDeps}/node_modules ./
    cp ${bunDeps}/bun.lock ./

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/ccusage $out/bin

    # Copy source and dependencies
    cp -r . $out/lib/ccusage/

    # Create wrapper script
    makeWrapper ${bun}/bin/bun $out/bin/ccusage \
        --add-flags "run" \
        --add-flags "$out/lib/ccusage/src/index.ts"

    runHook postInstall
  '';

  meta = with lib; {
    description = "A CLI tool for analyzing Claude Code usage from local JSONL files";
    homepage = "https://github.com/ryoppippi/ccusage";
    changelog = "https://github.com/ryoppippi/ccusage/releases/tag/v${version}";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "ccusage";
    platforms = platforms.all;
  };
}
