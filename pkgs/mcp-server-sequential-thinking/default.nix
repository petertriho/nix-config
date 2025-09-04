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
  version = "2025.9.3-unstable-2025-09-03";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "ae0be7d7c3128f2811c10d1d9f85d1c713c5c384";
    sha256 = "sha256-yUUfS9rR3VNqU8yRLpan/LFV3+lSMnp4CnGAlO5C9Bo=";
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
