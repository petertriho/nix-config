{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  jq,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-cache-optimizer";
  version = "2.10.0-unstable-2026-10-18";

  src = fetchFromGitHub {
    owner = "jiangge";
    repo = "pi-cache-optimizer";
    rev = "b0ce1e1655751c14a8e70892989c057285273f27";
    hash = "sha256-lW9kfVdt9vFWXhvHmuURubWUhEFspyeb/sURwg1cZW8=";
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
