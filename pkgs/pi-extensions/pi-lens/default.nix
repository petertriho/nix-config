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
  version = "4.0.0-unstable-2026-08-14";

  src = fetchFromGitHub {
    owner = "apmantza";
    repo = "pi-lens";
    rev = "23cc58a7fd8bcd2a0c733c309862df51034baf43";
    hash = "sha256-jDRx0lpPYmE50pjVKTX4lF046NchylHd4SuV3DXfe8Y=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-boqnZoC9smY4tEUefLZGK0eebHxhc2GmRHm6FAMo/gc=";
  npmDepsFetcherVersion = 2;
  npmPackFlags = [ "--ignore-scripts" ];

  # npm omits integrity hashes for the nested packages that satisfy the
  # pi-coding-agent peer dependency. fetchNpmDeps needs these hashes.
  postPatch = ''
    substituteInPlace package-lock.json \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.84.2.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.84.2.tgz",\n      "integrity": "sha512-8Pn3wSCxj0cfo5I6jxQYVB/3uuQRmHhAlEclyjqpOuMEdQMIODHizRogv56FLdbU+dTiGnybeHQ2N+sV1/L2YA==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.84.2.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.84.2.tgz",\n      "integrity": "sha512-6MzsrYIYNVlE7SfpbL2yYb67Qo58p/7Q+xWG1RZvoX1P80aRCHSod2/13aFpxkow1lPO2LEh3c495J0Gwmyjig==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-client/-/pi-client-0.84.2.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-client/-/pi-client-0.84.2.tgz",\n      "integrity": "sha512-/RFSPhD/bZbpOp1oJj+UneSUFSgZhWxzcSENUY+8+8xhoBrWXMYI2t77XNx4Yf+c8YK2qTHquForhNcelYpXvg==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-protocol/-/pi-protocol-0.84.2.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-protocol/-/pi-protocol-0.84.2.tgz",\n      "integrity": "sha512-jbBh03fkeckWEroHpcZBr4w5/Ibat8WwdXFlXHivYQImrQNFtLpDeL0t1cku4hmK0q3pceIRQHkw4fwbM4YILQ==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-telemetry/-/pi-telemetry-0.84.2.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-telemetry/-/pi-telemetry-0.84.2.tgz",\n      "integrity": "sha512-wg5caea7uIv1BHRBm2Y116RvFG4oSAiP5qk9tA2463PDGIr4K8M1Ceyyg5DOpF/shUUl0gk826yQJAeAcHYB9g==",\n      "dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.84.2.tgz",\n      "dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.84.2.tgz",\n      "integrity": "sha512-ds2TLihOnM5sLJB3VpXV6y0uR5efVuHf4MN7yDpsty6hA2DUO/EDVzjp/0od0G2JslzVLMjT8T8zavtxVb+qbg==",\n      "dev": true,'
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
