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
  version = "2025.8.21-unstable-2025-08-23";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "338d8af7a6d117b848d42e07b9ac480e16b80343";
    sha256 = "sha256-rjiFfvo575Cxjmeh7bJzZ3UkFaVnoFdb/tfO2Pef/3o=";
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
