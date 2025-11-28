# https://github.com/natsukium/mcp-servers-nix/tree/main
{
  lib,
  fetchFromGitHub,
  buildNpmPackage,
  typescript,
  writeScriptBin,
  nodejs,
  makeWrapper,
}:
let
  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "d1d6a123c6d1480ed75298b5c2458168fddb1970";
    sha256 = "sha256-qGNDIZIjLEalBkC/CRRcOaNUGrNiO/9MtPWt+nhUWpg=";
  };
in
buildNpmPackage {
  pname = "mcp-server-sequential-thinking";
  version = "2025.11.28-unstable-2025-11-28";

  inherit src;

  npmDepsHash = "sha256-dO++/1oGWgwv+1cVVElw7uPu6Kdk25Uhi4OiQ+m6LOM=";

  prePatch = ''
    # Remove test files from filesystem workspace before build
    rm -rf src/filesystem/__tests__ || true
    find src/filesystem -name "*.test.ts" -delete || true
  '';

  env.PUPPETEER_SKIP_DOWNLOAD = true;

  nativeBuildInputs = [
    typescript
    makeWrapper
    (writeScriptBin "shx" "")
  ];

  npmFlags = [ "--legacy-peer-deps" ];

  # Custom build phase to only build sequentialthinking
  buildPhase = ''
    runHook preBuild
    npm run build --workspace=src/sequentialthinking
    runHook postBuild
  '';

  # Skip npm install since we're using workspace
  dontNpmInstall = true;

  # Manually install the built package
  installPhase = ''
    runHook preInstall
    
    # Create output structure
    mkdir -p $out/lib/node_modules/@modelcontextprotocol/server-sequential-thinking
    mkdir -p $out/bin
    
    # Copy the built dist directory
    cp -r src/sequentialthinking/dist $out/lib/node_modules/@modelcontextprotocol/server-sequential-thinking/
    cp src/sequentialthinking/package.json $out/lib/node_modules/@modelcontextprotocol/server-sequential-thinking/
    
    # Copy root node_modules first (has most packages)
    cp -r node_modules $out/lib/node_modules/@modelcontextprotocol/server-sequential-thinking/
    
    # Then overlay the workspace-specific node_modules (has SDK and workspace-specific deps)
    if [ -d "src/sequentialthinking/node_modules" ]; then
      cp -r src/sequentialthinking/node_modules/* $out/lib/node_modules/@modelcontextprotocol/server-sequential-thinking/node_modules/ || true
    fi
    
    # Make the binary executable
    chmod +x $out/lib/node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js
    
    # Create wrapper using makeWrapper
    makeWrapper $out/lib/node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js \
      $out/bin/mcp-server-sequential-thinking \
      --prefix PATH : ${lib.makeBinPath [ nodejs ]}
    
    runHook postInstall
  '';

  # Skip broken symlink checks
  dontCheckForBrokenSymlinks = true;

  # Skip tests
  doCheck = false;

  meta = {
    description = "Model Context Protocol Server for sequential thinking";
    homepage = "https://github.com/modelcontextprotocol/servers";
    license = lib.licenses.mit;
    mainProgram = "mcp-server-sequential-thinking";
  };
}
