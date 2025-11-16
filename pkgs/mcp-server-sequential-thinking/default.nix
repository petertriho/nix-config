# https://github.com/natsukium/mcp-servers-nix/tree/main
{
  lib,
  fetchFromGitHub,
  buildNpmPackage,
  typescript,
  writeScriptBin,
}:
buildNpmPackage {
  pname = "mcp-server-sequential-thinking";
  version = "2025.9.25-unstable-2025-11-15";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "0d0d2f87bf7875cf3a496e2bd897681707aa8be2";
    sha256 = "sha256-WJfJkOlQzxADG6r5CVw5AoaloSQeAYRTSV0IGnQWSig=";
  };

  npmDepsHash = "sha256-GQYLDBwmcaWcUmklFkyivBuVAEblXIsXdnxIJOcibIw=";

  npmWorkspace = "src/sequentialthinking";

  prePatch = ''
    # Remove test files from filesystem workspace before build
    rm -rf src/filesystem/__tests__ || true
    find src/filesystem -name "*.test.ts" -delete || true
  '';

  env.PUPPETEER_SKIP_DOWNLOAD = true;

  nativeBuildInputs = [
    typescript
    (writeScriptBin "shx" "")
  ];

  npmFlags = [ "--legacy-peer-deps" ];

  dontCheckForBrokenSymlinks = true;

  meta = {
    description = "Model Context Protocol Server for sequential thinking";
    homepage = "https://github.com/modelcontextprotocol/servers";
    license = lib.licenses.mit;
    mainProgram = "mcp-server-sequential-thinking";
  };
}
