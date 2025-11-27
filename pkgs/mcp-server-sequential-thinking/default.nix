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
  version = "2025.11.25-unstable-2025-11-26";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "9b91729fe4a3ce64795847ae0d9858bfec93944c";
    sha256 = "sha256-6btRJhWwv7+moBIMnEAOJhdwq0PhCMr6aPM2Odsaw4I=";
  };

  npmDepsHash = "sha256-dO++/1oGWgwv+1cVVElw7uPu6Kdk25Uhi4OiQ+m6LOM=";

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
