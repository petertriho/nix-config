{
  lib,
  stdenv,
  buildNpmPackage,
  esbuild,
  fetchFromGitHub,
  fetchurl,
  nixfmt,
  nodejs_24,
  autoPatchelfHook,
  writeText,
  stripNpmManifest,
  updateNpmLock,
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

in
buildNpmPackage (finalAttrs: {
  pname = "pi-lens";
  version = "4.4.6-unstable-2026-10-29";

  src = fetchFromGitHub {
    owner = "apmantza";
    repo = "pi-lens";
    rev = "c80967063a8db224a4177a7190d178660f655fc2";
    hash = "sha256-6PyUoir7+rrHf4DNXvldpVBX4xoeX36RQfiU2JAN5Wg=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-Y/2sKSgHOHR19QQH3mZFhj1BdqM4qivuJoDk4xYCPl0=";
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
  #  - @earendil-works/pi-tui and typebox moved to optional peerDependencies
  #    upstream at this rev: pi injects them at runtime, so the strip drops
  #    them and the esbuild bundle keeps them external.
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
  passthru.updateScript = updateNpmLock {
    inherit (finalAttrs)
      pname
      src
      postPatch
      npmDepsFetcherVersion
      ;
    extraFiles."grammars.nix" = ''
      echo '# Generated from pi-lens scripts/grammars.lock.json by passthru.updateScript. Do not edit.'
      nix eval --impure --expr '
        let
          manifest = builtins.fromJSON (
            builtins.readFile ${builtins.toJSON "${finalAttrs.src}/scripts/grammars.lock.json"}
          );
          overrides = manifest.overrides or {};
        in
        map (
          filename:
          let
            source =
              if builtins.hasAttr filename overrides then
                builtins.getAttr filename overrides
              else {
                package = manifest.package;
                version = manifest.version;
                url = "https://unpkg.com/" + manifest.package + "@" + manifest.version + "/out/" + filename;
              };
            hash = builtins.getAttr filename manifest.grammars;
          in
          assert builtins.match "sha256:[0-9a-f]{64}" hash != null;
          {
            inherit filename;
            npmPackage = source.package;
            inherit (source) version url;
            sha256 = builtins.substring 7 64 hash;
          }
        ) (builtins.attrNames manifest.grammars)
      ' | ${lib.getExe nixfmt} -
    '';
  };

  buildPhase = ''
    runHook preBuild

    rm -rf dist
    ./node_modules/.bin/tsc --project tsconfig.dist.json --noCheck
    esbuild dist/index.js \
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

  nativeBuildInputs = [
    esbuild
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
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
})
