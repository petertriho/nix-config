{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  jq,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-cache-optimizer";
  version = "2.8.25-unstable-2026-10-14";

  src = fetchFromGitHub {
    owner = "jiangge";
    repo = "pi-cache-optimizer";
    rev = "aa70a16d6e905e0b8fef7b53f970bd7e17a7ec72";
    hash = "sha256-8a57uNoQsA2IAVLtGLXHVyzKOam9DuPbKCHhM4UeTaY=";
  };

  nativeBuildInputs = [ jq ];
  dontBuild = true;

  # Pi supplies the peer dependency and loads TypeScript directly.
  # The upstream files list includes the entry point and its runtime modules.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-cache-optimizer
    mkdir -p "$packageRoot"
    cp package.json README.md LICENSE "$packageRoot/"
    jq -r '.files[]' package.json | while IFS= read -r file; do
      cp -r --parents "$file" "$packageRoot/"
    done

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck

    packageRoot=$out/lib/node_modules/pi-cache-optimizer
    jq -r '.files[]' package.json | while IFS= read -r file; do
      diff -r "$file" "$packageRoot/$file"
    done
    jq -r '.pi.extensions[]' package.json | while IFS= read -r file; do
      test -f "$packageRoot/$file"
    done

    runHook postInstallCheck
  '';

  meta = {
    description = "Prompt/KV cache hit-rate optimizer extension for Pi";
    homepage = "https://github.com/jiangge/pi-cache-optimizer";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
