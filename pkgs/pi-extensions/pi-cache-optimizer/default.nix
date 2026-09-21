{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-cache-optimizer";
  version = "2.8.10-unstable-2026-09-20";

  src = fetchFromGitHub {
    owner = "jiangge";
    repo = "pi-cache-optimizer";
    rev = "0e59a256f1403ecc11c8b7337452981abec54bbb";
    hash = "sha256-cZj8GCsSKhWdC7Br/cghbGpZD/2k1Iafksov/3RTDok=";
  };

  # Zero runtime dependencies (peer dep @earendil-works/pi-coding-agent is
  # injected by pi at runtime); ship the raw TypeScript entry exactly like
  # `pi install npm:pi-cache-optimizer` does.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-cache-optimizer
    mkdir -p "$packageRoot"
    cp package.json index.ts README.md LICENSE "$packageRoot/"

    runHook postInstall
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
