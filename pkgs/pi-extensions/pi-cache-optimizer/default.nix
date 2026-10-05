{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-cache-optimizer";
  version = "2.8.19-unstable-2026-10-05";

  src = fetchFromGitHub {
    owner = "jiangge";
    repo = "pi-cache-optimizer";
    rev = "59f3e7785e42b1f36bb0a8e6df6e000bb4a49e53";
    hash = "sha256-3ISDWZWvRbcd6lMyq6XuZskLz2ZINriY2OEuUbnKCXY=";
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
