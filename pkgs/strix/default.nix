{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  zlib,
}:
let
  # Hashes of the release tarballs, each unpacking to a single PyInstaller
  # onefile binary. Refresh all four together on a version bump: tag is
  # v${version} and URLs embed the platform, matching the
  # donsetch/bladebro/codexbar pattern the nixcfg asset prefetcher walks.
  assets = {
    x86_64-linux = {
      url = "https://github.com/usestrix/strix/releases/download/v${version}/strix-${version}-linux-x86_64.tar.gz";
      hash = "sha256-uM1+hNY8vv9nJjAangj93t9A/GpO3NtO3aioU7MxLeY=";
    };
    aarch64-linux = {
      url = "https://github.com/usestrix/strix/releases/download/v${version}/strix-${version}-linux-arm64.tar.gz";
      hash = "sha256-n0qCbF0edrXFA+MpmAevhUmsyi4Dc0tmA2Eb4nWRft4=";
    };
    x86_64-darwin = {
      url = "https://github.com/usestrix/strix/releases/download/v${version}/strix-${version}-macos-x86_64.tar.gz";
      hash = "sha256-5CXwAARHQam+u+2yZe9m7+q7pI5FrBU3Sx35wJK13z4=";
    };
    aarch64-darwin = {
      url = "https://github.com/usestrix/strix/releases/download/v${version}/strix-${version}-macos-arm64.tar.gz";
      hash = "sha256-JmBwELGCKnp7A1PTcswAvhSfkdE4LoqZ35arQzWvxqA=";
    };
  };
  version = "1.7.0";

  # Name of the bare executable inside the unpacked tarball (= URL basename).
  extractedBinary = lib.removeSuffix ".tar.gz" (lib.baseNameOf assets.${stdenv.hostPlatform.system}.url);
in
stdenv.mkDerivation (finalAttrs: {
  pname = "strix";
  inherit version;

  src = fetchurl assets.${stdenv.hostPlatform.system};

  # PyInstaller onefile binary: bundles its own Python and stdlib, and the
  # outer ELF links glibc plus libz on Linux (autoPatchelf closes the
  # NEEDED entry the stock host resolves nowhere). macOS binaries run
  # under the stock loader unpatched, as with bladebro. docker/git/npx
  # are runtime PATH lookups on purpose: unwrapped, matching the house
  # style, so missing-runtime behavior stays the upstream-published one.
  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ zlib ];

  # The tarball holds a single bare executable and no directory, which the
  # default single-dir heuristic rejects; pin the source root to the unpack
  # directory itself.
  sourceRoot = ".";
  dontConfigure = true;
  dontBuild = true;

  # A PyInstaller onefile binary keeps its PKG archive appended after the
  # executable payload. The fixup strip hook rewrites only the payload, so
  # strip -S drops the archive (93 MB -> 88 KB) and the runtime exits with
  # "Could not load PyInstaller's embedded PKG archive".
  dontStrip = true;

  installPhase = ''
    runHook preInstall
    install -Dm555 "${extractedBinary}" $out/bin/strix
    runHook postInstall
  '';

  # Offline check only: --help exercises arg parsing and exits 0. The
  # onefile payload extracts to a temp dir on first run, which the build
  # sandbox allows via /tmp.
  installCheckPhase = ''
    runHook preInstallCheck
    $out/bin/strix --help > /dev/null
    runHook postInstallCheck
  '';
  doInstallCheck = true;

  meta = {
    description = "Open-source AI penetration testing tool to find and fix your app's vulnerabilities";
    homepage = "https://github.com/usestrix/strix";
    changelog = "https://github.com/usestrix/strix/releases";
    license = lib.licenses.asl20;
    mainProgram = "strix";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
})
