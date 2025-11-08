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
  version = "unstable-2025-11-08";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "65994ca3db466796b8e1e9082d0c2d1855cb73d4";
    sha256 = "1n51h7xpplshfbjl43viknaf6p2mkgcm27f0dycf3pf1kpm7l399";
  };

  npmDepsHash = "sha256-GQYLDBwmcaWcUmklFkyivBuVAEblXIsXdnxIJOcibIw=";

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
