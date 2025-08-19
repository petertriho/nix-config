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
    "aarch64-darwin" = "sha256-/Twn8sc00X0ZQ+/zEsFv4M4auaGzH9Iw4cwFCxWXBI8=";
    "aarch64-linux" = "sha256-OAK74ybiPYbC7DA5ivOviFnXhzfJyrjnyd19n+RvD7g=";
    "x86_64-darwin" = "sha256-/Twn8sc00X0ZQ+/zEsFv4M4auaGzH9Iw4cwFCxWXBI8=";
    "x86_64-linux" = "sha256-OAK74ybiPYbC7DA5ivOviFnXhzfJyrjnyd19n+RvD7g=";
  };
  # Fixed-output derivation for node_modules
  bunDeps = stdenv.mkDerivation {
    pname = "ccusage-bun-deps";
    version = "15.9.7-unstable-2025-08-17";

    src = fetchFromGitHub {
      owner = "ryoppippi";
      repo = "ccusage";
      rev = "587c67ac4c700918741132798efeac7f3b521f58";
      sha256 = "sha256-/8yvxBoSzGTOAVsqxrY4NhSvSb0HgZnwbpUrFjRM9eA=";
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
  version = "15.10.0-unstable-2025-08-19";

  src = fetchFromGitHub {
    owner = "ryoppippi";
    repo = "ccusage";
    rev = "587c67ac4c700918741132798efeac7f3b521f58";
    sha256 = "sha256-/8yvxBoSzGTOAVsqxrY4NhSvSb0HgZnwbpUrFjRM9eA=";
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
