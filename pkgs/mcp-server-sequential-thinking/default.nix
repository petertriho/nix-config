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
  version = "2025.9.25-unstable-2025-10-20";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "dc21983e3b2f39f3c7d1f84209cb83f8ff982ca7";
    sha256 = "sha256-mOPDFiISfdHR72pwG/Ltdx6vpZwXsu9zVslVXgAx/oQ=";
  };

  npmDepsHash = "sha256-IgvYo4GqQ6drJnxYrq5VRjd2UMCcYZ1EWVcT6V4ZR0E=";

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
