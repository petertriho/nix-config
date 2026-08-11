{
  lib,
  stdenv,
  stdenvNoCC,
  buildNpmPackage,
  fetchFromGitHub,
  fetchurl,
  nodejs_24,
  autoPatchelfHook,
  writeText,
}:
let
  grammars = import ./grammars.nix;

  grammarFiles = map (
    grammar:
    grammar
    // {
      wasm = fetchurl {
        name = grammar.filename;
        inherit (grammar) url sha256;
      };
      sidecar = writeText "${grammar.filename}.json" ''
        {
          "npmPackage": ${builtins.toJSON grammar.npmPackage},
          "version": ${builtins.toJSON grammar.version},
          "sha256": ${builtins.toJSON "sha256:${grammar.sha256}"}
        }
      '';
    }
  ) grammars;

  esbuildVersion = "0.28.1";
  esbuildPlatform =
    {
      "x86_64-linux" = {
        package = "linux-x64";
        hash = "sha512-u/anNYF2mmVOEDwLtnQ1wOr3EZ9sTNGLWrsYGYwHWzGA3Si84IOkHXlbWTD1NB+9/1lcnweYKO54uhxZydNzfA==";
      };
      "aarch64-linux" = {
        package = "linux-arm64";
        hash = "sha512-yHs+0uc8+nvEAfAfxrWQKK5peSNzBc4PegcMO0EJ2hT71uA7vB8Ihg2e77R2P7SG5uYjPbHlLLmve4LLLRCf0g==";
      };
      "x86_64-darwin" = {
        package = "darwin-x64";
        hash = "sha512-zfdzgK9ACBNZLI/CyHTOx81SyNbM6YXn7rxSgX97VjyiPl9W1i4Ka4fgKECEoFCKGpvBj5qArWIGgQjOwkgskQ==";
      };
      "aarch64-darwin" = {
        package = "darwin-arm64";
        hash = "sha512-TZbWkQY7kvTAXbXUT7uVACR5cMHsDiSz9z7ZKAX/RTq/WJEk3QyRr0wZpNhBDX+/0CtdqUIJlOiodQcta6tY3Q==";
      };
    }
    .${stdenv.hostPlatform.system};

  esbuildBinary = stdenvNoCC.mkDerivation {
    pname = "esbuild-${esbuildPlatform.package}";
    version = esbuildVersion;

    src = fetchurl {
      url = "https://registry.npmjs.org/@esbuild/${esbuildPlatform.package}/-/${esbuildPlatform.package}-${esbuildVersion}.tgz";
      inherit (esbuildPlatform) hash;
    };

    dontUnpack = true;

    installPhase = ''
      runHook preInstall

      tar -xzf "$src"
      install -Dm755 package/bin/esbuild "$out/bin/esbuild"

      runHook postInstall
    '';
  };
in
buildNpmPackage {
  pname = "pi-lens";
  version = "3.8.74-unstable-2026-08-11";

  src = fetchFromGitHub {
    owner = "apmantza";
    repo = "pi-lens";
    rev = "1eeced0b972a0139b1d808739eccc56956b0b7eb";
    hash = "sha256-TetG6Fb11hIvAa+V/SM7nwM5ugqFNkZk4en1uGjtJhU=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-owMNTkFAs5na/QTvaGgKt4iwcrrFDd8LPBiXWfYKJuM=";
  npmDepsFetcherVersion = 2;
  npmPackFlags = [ "--ignore-scripts" ];

  # npm omits integrity hashes for the nested packages that satisfy the
  # pi-coding-agent peer dependency. fetchNpmDeps needs these hashes.
  postPatch = ''
    substituteInPlace package-lock.json \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.84.1.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.84.1.tgz",\n      "integrity": "sha512-evyzXYWCLQGmcaBYHlmSku02r8qoN4SGI60GZABo6iV+H+nqX+P9ud8fEZ4GmRq9mUSREvvfX+w9dA9ThF9C6w==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.84.1.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.84.1.tgz",\n      "integrity": "sha512-wMsAdJMxuNri08vLqTyYVI201DQQezGhPSTkzYsHdw5dYX3rCNwEmSvpaAwhi7ELKI/2tE/CEgSWg/6iRxSgdQ==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-client/-/pi-client-0.84.1.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-client/-/pi-client-0.84.1.tgz",\n      "integrity": "sha512-/V5hGHE4Zq+jG0GtwIB9PyBUOGd6gBLZ7lkQYFKchKnxYHeH3rmWC5xw4kpnZKKBuBuFTdLVbU9vEjlAGMMb2A==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-protocol/-/pi-protocol-0.84.1.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-protocol/-/pi-protocol-0.84.1.tgz",\n      "integrity": "sha512-Ox1pciyeSPGEEUcxvR0/dJcrY7C6hrEGA8y71rOsvSIUlXN1Cbp/be/eoL71OGDBk5O97TeQPfWN6Ju/2Ehjww==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-telemetry/-/pi-telemetry-0.84.1.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-telemetry/-/pi-telemetry-0.84.1.tgz",\n      "integrity": "sha512-180/xGJtsq7IoR3p9EKWjRd0e9M4DkxInhlo9xyD7prDC7Qrhqq+nhvwrW0lFjPfXcEI2FSHmGCSyvSJE9GsaQ==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.84.1.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.84.1.tgz",\n      "integrity": "sha512-udeXFbgEhJ6JiB0uguwNVNkDy2FENfmtQwPcY+/iJ8GWeq18wkal1tKqa5YyeH0IqtX1vG0cGh8zfSYzyzVuLA==",\n      "dev": true,'
  '';

  buildPhase = ''
    runHook preBuild

    rm -rf dist
    ./node_modules/.bin/tsc --project tsconfig.dist.json --noCheck
    ${esbuildBinary}/bin/esbuild dist/index.js \
      --bundle \
      --platform=node \
      --format=esm \
      --external:typebox \
      --external:@earendil-works/pi-coding-agent \
      --external:@earendil-works/pi-tui \
      --external:@ast-grep/napi \
      --external:web-tree-sitter \
      --outfile=dist/index.bundled.mjs

    printf '%s\n' 'import { createRequire as __pilensCreateRequire } from "node:module"; const require = __pilensCreateRequire(import.meta.url);' > dist/index.js
    cat dist/index.bundled.mjs >> dist/index.js
    rm dist/index.bundled.mjs

    runHook postBuild
  '';

  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  postInstall = ''
    packageRoot=$out/lib/node_modules/pi-lens
    mkdir -p "$packageRoot/grammars"
    ${lib.concatMapStringsSep "\n" (grammar: ''
      install -m644 ${grammar.wasm} "$packageRoot/grammars/${grammar.filename}"
      install -m644 ${grammar.sidecar} "$packageRoot/grammars/${grammar.filename}.json"
    '') grammarFiles}
  '';

  meta = {
    description = "Real-time code feedback extension for Pi";
    homepage = "https://github.com/apmantza/pi-lens";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = "pi-lens";
  };
}
