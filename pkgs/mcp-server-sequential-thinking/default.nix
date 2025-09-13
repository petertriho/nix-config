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
  version = "2025.9.12-unstable-2025-09-12";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "bf293463200a74ff6724fb14a7f3954aed74de96";
    sha256 = "sha256-dny1lv8f1TWvK/uBHmcN7FQrsTBRYO94DNb05o19ZX4=";
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
