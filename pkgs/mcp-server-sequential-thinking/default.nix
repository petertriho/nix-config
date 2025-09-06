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
  version = "2025.9.3-unstable-2025-09-05";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "8ba0ff5e4c74b1b0034f30f4ad75632183df67f4";
    sha256 = "sha256-Ew+MSOWYOjhjvgiWPYrPNBoSEEXOkRGPIPA0WWtKHU0=";
  };

  npmDepsHash = "sha256-SaBfH0dhXRqIRTOeHQr9QPDWz5zYjh/8yeBaXRbtszE=";

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
