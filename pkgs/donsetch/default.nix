{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
}:
let
  # Hashes of the release tarballs, cross-checked against the .sha256
  # sidecars published alongside each asset. Refresh all four together on a
  # version bump: tag is v${version} and asset names embed it only in the
  # release URL, not the file name.
  assets = {
    x86_64-linux = {
      url = "https://github.com/dondai44423/donsetch/releases/download/v${version}/donsetch-linux-x64.tar.gz";
      hash = "sha256-U+KlAs0UROO7LU8R+bnej09HDE67TYy8E7peVVLAiPI=";
    };
    aarch64-linux = {
      url = "https://github.com/dondai44423/donsetch/releases/download/v${version}/donsetch-linux-arm64.tar.gz";
      hash = "sha256-jetRAouBbqm+ht7md48GMtSyH/CwiPGcPTNvZtHkQ5U=";
    };
    aarch64-darwin = {
      url = "https://github.com/dondai44423/donsetch/releases/download/v${version}/donsetch-darwin-arm64.tar.gz";
      hash = "sha256-kpz6E5VTY7sNpREjaawWxBLtN7kyWP3TB5ibTiLGdKI=";
    };
    x86_64-darwin = {
      url = "https://github.com/dondai44423/donsetch/releases/download/v${version}/donsetch-darwin-x64.tar.gz";
      hash = "sha256-ntkt4+x43vIArqmwoVEBhfRQAXUN6zUnD8Uokrzt8QE=";
    };
  };
  version = "5.3.0";
in
stdenv.mkDerivation (finalAttrs: {
  pname = "donsetch";
  inherit version;

  src = fetchurl assets.${stdenv.hostPlatform.system};

  # Prebuilt glibc binary links libstdc++ (BoringSSL's C++); autoPatchelf
  # rewrites the interpreter and rpath on Linux. Upstream has no musl
  # artifacts, so Linux hosts must be glibc.
  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  sourceRoot = ".";

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    install -Dm555 donsetch -t $out/bin
    runHook postInstall
  '';

  # Offline check only: `doctor` needs network and a browser, neither of which
  # exists in the build sandbox. `--help` exercises arg parsing and exits 0.
  installCheckPhase = ''
    runHook preInstallCheck
    $out/bin/donsetch --help > /dev/null
    runHook postInstallCheck
  '';
  doInstallCheck = true;

  meta = {
    description = "Web fetch, search, and crawl for AI agents. No keys, no accounts";
    homepage = "https://github.com/dondai44423/donsetch";
    changelog = "https://github.com/dondai44423/donsetch/blob/v${finalAttrs.version}/CHANGELOG.md";
    license = lib.licenses.agpl3Only;
    mainProgram = "donsetch";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
})
