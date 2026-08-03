{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-cache-optimizer";
  version = "2.6.25-unstable-2026-07-27";

  src = fetchFromGitHub {
    owner = "jiangge";
    repo = "pi-cache-optimizer";
    rev = "28a0b4626f58fccbb90ee36465786abf65b0d398";
    hash = "sha256-maCFdodJD5NkzgLXIffpcy66Yuatq3X4aWgBjDSN5h8=";
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
