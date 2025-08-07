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
    "aarch64-darwin" = "sha256-Ver9Sf+UgNRen6bU3chWB+L/p3yBghqFSYnJV08zIN0=";
    "aarch64-linux" = "sha256-qU9/cLsMkhbZj8Xp4NZUr89FVDoB3HnpI5THyvIvG+M=";
    "x86_64-darwin" = "sha256-Ver9Sf+UgNRen6bU3chWB+L/p3yBghqFSYnJV08zIN0=";
    "x86_64-linux" = "sha256-qU9/cLsMkhbZj8Xp4NZUr89FVDoB3HnpI5THyvIvG+M=";
  };
  # Fixed-output derivation for node_modules
  bunDeps = stdenv.mkDerivation {
    pname = "ccusage-bun-deps";
    version = "unstable-2025-08-07";

    src = fetchFromGitHub {
      owner = "ryoppippi";
      repo = "ccusage";
      rev = "8dc3a320c096b2bcbf6c3ffe876a6cfcff0e5135";
      sha256 = "1z13aa8wx5nfhsyzq6z7fy1rd23l473p531s6m32afs3ffpkyvbn";
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
  version = "unstable-2025-08-07";

  src = fetchFromGitHub {
    owner = "ryoppippi";
    repo = "ccusage";
    rev = "8dc3a320c096b2bcbf6c3ffe876a6cfcff0e5135";
    sha256 = "1z13aa8wx5nfhsyzq6z7fy1rd23l473p531s6m32afs3ffpkyvbn";
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
