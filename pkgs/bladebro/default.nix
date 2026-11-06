{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  libgcc,
}:
let
  # Hashes of the raw release binaries, cross-checked against the .sha256
  # sidecars published alongside each asset. Refresh all four together on a
  # version bump: tag is v${version} and asset names embed the platform only,
  # so a version bump is just version + four hashes.
  assets = {
    x86_64-linux = {
      url = "https://github.com/dondai44423/bladebro/releases/download/v${version}/bladebro-linux-x64";
      hash = "sha256-54Tl1K2fb3L+KmhbXw2iEG5Lzm1jIzAyjGPmfs2wK6Y=";
    };
    aarch64-linux = {
      url = "https://github.com/dondai44423/bladebro/releases/download/v${version}/bladebro-linux-arm64";
      hash = "sha256-vJNJau0vxqvqvgSMR7/Eu5dVI+5i21ZvSTn914vnzpI=";
    };
    aarch64-darwin = {
      url = "https://github.com/dondai44423/bladebro/releases/download/v${version}/bladebro-darwin-arm64";
      hash = "sha256-xG/+EEp/IXsXcZss8iLVOAbYiK312pUAMKbIi3vx4Uw=";
    };
    x86_64-darwin = {
      url = "https://github.com/dondai44423/bladebro/releases/download/v${version}/bladebro-darwin-x64";
      hash = "sha256-y9t8CsPx5v7aVZgcronbOE/mtvST7GjbWPWBJ9RZ058=";
    };
  };
  version = "4.6.8";
in
stdenv.mkDerivation (finalAttrs: {
  pname = "bladebro";
  inherit version;

  src = fetchurl assets.${stdenv.hostPlatform.system};

  # Prebuilt glibc Rust binary: links libgcc_s.so.1 for stack unwinding
  # (rustls, no OpenSSL, no libstdc++). autoPatchelf rewrites the
  # interpreter and rpath on Linux; upstream has no musl artifacts, so
  # Linux hosts must be glibc.
  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ libgcc ];

  dontUnpack = true;
  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    install -Dm555 $src $out/bin/bladebro
    runHook postInstall
  '';

  # Offline check only: the browser and CDP endpoints need network and a
  # Chromium, neither of which exists in the build sandbox. `--help`
  # exercises arg parsing and exits 0.
  installCheckPhase = ''
    runHook preInstallCheck
    $out/bin/bladebro --help > /dev/null
    runHook postInstallCheck
  '';
  doInstallCheck = true;

  meta = {
    description = "An agentic browser driver for AI — few tools, full control, real stealth";
    homepage = "https://github.com/dondai44423/bladebro";
    changelog = "https://github.com/dondai44423/bladebro/blob/v${finalAttrs.version}/CHANGELOG.md";
    license = lib.licenses.asl20;
    mainProgram = "bladebro";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
})
