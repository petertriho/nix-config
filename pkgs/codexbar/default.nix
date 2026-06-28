{
  lib,
  stdenv,
  fetchurl,
  makeWrapper,
  cacert,
}:
let
  version = "0.37.2";

  # Official prebuilt static-musl Linux tarballs (v0.37.2). Static-musl → no
  # dynamic lib deps, so no patchelf/runtimeDeps; only a CA-bundle wrapper for
  # TLS (codexbar makes HTTPS calls for OAuth/quota APIs). Swift source build is
  # blocked in nixpkgs (stuck at Swift 5.10; Package.swift requires 6.2), so we
  # fetch the upstream binary instead.
  assets = {
    x86_64-linux = {
      url = "https://github.com/steipete/CodexBar/releases/download/v${version}/CodexBarCLI-v${version}-linux-musl-x86_64.tar.gz";
      hash = "sha256-giiZX1r3VMkRXgPJnlmakol33KWtqnLyTfNv1lSlmZs=";
    };
    aarch64-linux = {
      url = "https://github.com/steipete/CodexBar/releases/download/v${version}/CodexBarCLI-v${version}-linux-musl-aarch64.tar.gz";
      hash = "sha256-4tLaB3SgLt12jxotElL41q5Lw+JXbTOojVTkBO2O3tM=";
    };
  };
  asset = assets.${stdenv.hostPlatform.system};
in
stdenv.mkDerivation {
  pname = "codexbar";
  inherit version;

  src = fetchurl { inherit (asset) url hash; };
  sourceRoot = ".";

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    # Tarball ships `CodexBarCLI` (+ a `codexbar` symlink + VERSION). Install the
    # real binary as `codexbar` so the name is deterministic regardless of the symlink.
    install -Dm555 CodexBarCLI $out/bin/codexbar
    # Static-musl TLS needs a CA bundle on NixOS; point the common cert env vars at cacert.
    wrapProgram $out/bin/codexbar \
      --set SSL_CERT_FILE "${cacert}/etc/ssl/certs/ca-bundle.crt" \
      --set NIX_SSL_CERT_FILE "${cacert}/etc/ssl/certs/ca-bundle.crt"
    runHook postInstall
  '';

  meta = with lib; {
    description = "CodexBar CLI — usage stats for OpenAI Codex, z.ai, OpenRouter, and more";
    homepage = "https://github.com/steipete/CodexBar";
    license = licenses.mit;
    mainProgram = "codexbar";
    platforms = platforms.linux;
  };
}
