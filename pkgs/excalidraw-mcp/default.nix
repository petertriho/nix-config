{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_10,
  pnpmConfigHook,
  nodejs,
  bun,
  typescript,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "excalidraw-mcp";
  version = "0.3.2-unstable-2026-03-22";

  src = fetchFromGitHub {
    owner = "excalidraw";
    repo = "excalidraw-mcp";
    rev = "542091bff3517f965b67b77dd5af5566817f682d";
    hash = "sha256-0iSVdHt6eT5c7clA55wScYgOX9KHOd4yKkf+YPoSTKE=";
  };

  nativeBuildInputs = [
    nodejs
    pnpmConfigHook
    pnpm_10
    bun
    typescript
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-4ufHadONm+GRMQ0rp8rfF4tFZyBC22BJ50zX9Xz6wJI=";
  };

  buildPhase = ''
    runHook preBuild
    pnpm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    install -Dm755 dist/index.js $out/bin/excalidraw-mcp
    runHook postInstall
  '';

  meta = with lib; {
    description = "Fast and streamable Excalidraw MCP App server";
    homepage = "https://github.com/excalidraw/excalidraw-mcp";
    license = licenses.mit;
    mainProgram = "excalidraw-mcp";
  };
})
