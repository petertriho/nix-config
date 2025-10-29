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
  version = "2025.9.25-unstable-2025-10-29";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "af87fb3af949681709c57f515d3bfd13f833492f";
    sha256 = "sha256-ceK+MQj8ZQdT+c1xHB2q0xzC5r/Z49DKKjwhacoSH6s=";
  };

  npmDepsHash = "sha256-Lgv9h4xWRMcncA43Y0oPODE8VHUsRHLlvhwjE+HFO+k=";

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
