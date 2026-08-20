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
  stripNpmManifest,
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
  version = "4.0.1-unstable-2026-08-20";

  src = fetchFromGitHub {
    owner = "apmantza";
    repo = "pi-lens";
    rev = "92f78008453349c80153599cd081726c97163850";
    hash = "sha256-7edMnniPQHhcGwxs0W6s3F8sclwavHX9TEAwJ2MoxpE=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-741QSTWLlnOSsvBWrJMbteki05JjcMMM7pePXRCaMvU=";
  npmDepsFetcherVersion = 2;
  npmPackFlags = [ "--ignore-scripts" ];

  # package.json is stripped in place and the lockfile regenerated from the
  # stripped manifest is vendored (the pi-tasks / pi-subagents pattern):
  #  - @earendil-works/pi-coding-agent is declared both as an optional
  #    peerDependency (pi injects it at runtime) and as a devDependency (for
  #    type-checking). Its nested transitive deps land in npm's lockfile with
  #    `resolved` but no `integrity` — six entries upstream — which panics
  #    nixpkgs' fetcher parser. These entries were previously integrity-patched
  #    by hand via substituteInPlace; instead the whole pi-coding-agent tree is
  #    dropped from the manifest, which removes the broken entries at the
  #    source, shrinks the FOD from ~170 locked packages (aws-sdk, openai,
  #    google/genai, ...) to 56, and stops the hand-patched integrity hashes
  #    tracking every pi release.
  #  - devDependencies are pruned to typescript + @types/node, the tsc the
  #    buildPhase runs from node_modules; the tsc run is --noCheck (see
  #    buildPhase), so the stripped peers' types are never consulted. They are
  #    dev-only for the install too (pruned before node_modules is copied to
  #    $out).
  #  - @earendil-works/pi-tui stays: it is a production dependency bundled into
  #    dist/ and used at runtime.
  # Everything else in package.json — pi.extensions, files, bin — flows from
  # upstream at the pinned rev.
  postPatch = stripNpmManifest {
    stripFields = [
      "peerDependencies"
      "peerDependenciesMeta"
    ];
    extraJqOps = [
      ''.devDependencies |= with_entries(select(.key == "typescript" or .key == "@types/node"))''
    ];
    lockfile = ./package-lock.json;
  };

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
