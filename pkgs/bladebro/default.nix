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
      hash = "sha256-UQeJ5zqQn/aqtSXAMNlmmY5m5KD4WzreyehmRZKliN0=";
    };
    aarch64-linux = {
      url = "https://github.com/dondai44423/bladebro/releases/download/v${version}/bladebro-linux-arm64";
      hash = "sha256-QunE4PRUyPAA0HV4apSWY8ZNcmE25zvDTyj08/mfJnI=";
    };
    aarch64-darwin = {
      url = "https://github.com/dondai44423/bladebro/releases/download/v${version}/bladebro-darwin-arm64";
      hash = "sha256-pTIo6kmEn8GS5OVBATdfJvZp1z4DsoO3ukU6npoNUOM=";
    };
    x86_64-darwin = {
      url = "https://github.com/dondai44423/bladebro/releases/download/v${version}/bladebro-darwin-x64";
      hash = "sha256-JwlYfA3dYXQ9Ats0WhL8Ka5ubMO9jWvCt1mEaYdY7IY=";
    };
  };
  version = "4.4.0";
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
