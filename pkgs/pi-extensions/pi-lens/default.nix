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
  version = "3.8.74-unstable-2026-08-02";

  src = fetchFromGitHub {
    owner = "apmantza";
    repo = "pi-lens";
    rev = "ddb82fa8f3f5998115652eb3fe7c6f962a3df538";
    hash = "sha256-CgWxyiuiw8MkkijPoSjvYG9yA900LJyZRZvKcgUjs20=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-pqDVeScGN1xTsKCxR3gNoP1sTMa0eyi73yegkZtVTeY=";
  npmDepsFetcherVersion = 2;
  npmPackFlags = [ "--ignore-scripts" ];

  postPatch = ''
    substituteInPlace package-lock.json \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.82.1.tgz",\n\t\t\t"dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.82.1.tgz", "integrity": "sha512-Z3kloziJIE2dmrisRckZX8zDca/gIv9/YdFAzeoqpHiLV2wsni6bL4hInNSjVKLbqT+4kqLIkph2JQLKvSepjg==",\n\t\t\t"dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.82.1.tgz",\n\t\t\t"dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.82.1.tgz", "integrity": "sha512-3WFYRhEp3lQB3444EhPMBcM7zSaEUE3eJgHOR7s4081NLqbw/FsWilIKWXSua0Gv3sRr7m9xMidR3pPDE7jI/A==",\n\t\t\t"dev": true,' \
      --replace-fail \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.82.1.tgz",\n\t\t\t"dev": true,' \
        $'"resolved": "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.82.1.tgz", "integrity": "sha512-9yN8hALfKaxZq7n54EMxqhFCWnMi6LHkraMJ/1YjHiATq75XrI6XDMVppn9EDtiK7Fks8hUe1SDXUTrIvwRWfQ==",\n\t\t\t"dev": true,'
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
