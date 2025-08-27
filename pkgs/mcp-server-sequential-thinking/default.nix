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
  version = "2025.8.21-unstable-2025-08-27";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "e3284edb473e096b8e74dff2014c8ee7aa7343ce";
    sha256 = "sha256-27BvjDvtPWEYmbfYsapn+BEvg54jooBGyBl/kjwPnX4=";
  };

  npmDepsHash = "sha256-oFeczlqBf2jElim1JKdCMUGsV6sH+S6kTi8Rc1m41Rs=";

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
