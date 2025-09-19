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
  version = "2025.9.12-unstable-2025-09-19";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "19534fa89b9d5c28ec09b46661c489d5bfd3d406";
    sha256 = "sha256-tX5t1bSp1ZjmOiP65UPaCcEX5keSpxEdZx3C4E4iDxw=";
  };

  npmDepsHash = "sha256-zFacrW1lZT4mcHRJBOVcKIJJ51kCiyGn6/ZhRVqSKAI=";

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
