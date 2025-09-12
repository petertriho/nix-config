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
  version = "2025.9.3-unstable-2025-09-12";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "2954894a9e73c0d4817f5108acec29a13cbd67fd";
    sha256 = "sha256-UtVs3WxGQAJDAfzYn+TCjKrXSjhKVoPMzEFprTwr8d0=";
  };

  npmDepsHash = "sha256-S/XEVrRxowCzEerb1c2vj7lIejBV5DsRo3ckuhIn/eg=";

  npmWorkspace = "src/sequentialthinking";

  env.PUPPETEER_SKIP_DOWNLOAD = true;

  nativeBuildInputs = [
    typescript
    (writeScriptBin "shx" "")
  ];

  dontCheckForBrokenSymlinks = true;

  meta = {
    description = "Model Context Protocol Server for sequential thinking";
    homepage = "https://github.com/modelcontextprotocol/servers";
    license = lib.licenses.mit;
    mainProgram = "mcp-server-sequential-thinking";
  };
}
