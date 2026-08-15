{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
}:
buildNpmPackage {
  pname = "pi-hashline-edit-pro";
  version = "0-unstable-2026-08-14";

  src = fetchFromGitHub {
    owner = "YuGiMob";
    repo = "pi-hashline-edit-pro";
    rev = "1635cbfd9e7ea3d51f262774b08ded1948caa3ba";
    hash = "sha256-3zVXKe9/d37F8ja015AdszhY0soCfhpxrna8emfyN0E=";
  };

  # Upstream package-lock.json records the six nested @earendil-works/* packages
  # (pulled in by the @earendil-works/pi-coding-agent devDependency) with
  # `resolved` but no `integrity`, which panics nixpkgs' npm fetcher lockfile
  # parser. Pi injects those peers at runtime, so we vendor a package.json with
  # peerDependencies stripped plus the matching lockfile regenerated from it
  # (mirrors pi-tasks / pi-subagents).
  #
  # devDependencies are stripped from the vendored package.json too, not just
  # omitted at install time: fetchNpmDeps prefetches every tarball the lockfile
  # references, and --omit=dev only prunes the *install*. The dev tree here is
  # the whole pi-coding-agent closure — aws-sdk, @google/genai, openai,
  # protobufjs, photon-node, nine platforms of clipboard prebuilts — none of it
  # reachable, since pi loads the TypeScript directly and there is no build
  # step. Stripping takes the fetched closure from 363 packages to 14, and
  # keeps the build off the hostage-to-unrelated-tooling path that broke
  # pi-tasks when @biomejs/biome was unpublished. Regenerate both files with:
  #   npm install --package-lock-only --ignore-scripts
  #
  # The vendored package.json is what pi reads from the store at load time, so
  # `pi.extensions` and `files` must survive the strip.
  # pi's package.json declares `bin: dist/cli.js` and `engines.node >= 22.19.0`,
  # so upstream's `node:sqlite` import is correct for pi's stated runtime. But
  # llm-agents.nix packages pi's other distribution — the `bun build --compile`
  # binary produced by pi's `build:binary` script — and Bun exposes bun:sqlite,
  # not node:sqlite. Unpatched, the extension fails at load with
  # "ResolveMessage: No such built-in module: node:sqlite".
  #
  # --replace-fail makes this loud if upstream restructures the import, rather
  # than silently shipping an extension that dies on first read.
  postPatch = ''
    cp ${./package-no-peers.json} package.json
    cp ${./package-lock.json} package-lock.json

    cp ${./bun-sqlite-shim.ts} src/bun-sqlite-shim.ts
    substituteInPlace src/hash-store.ts \
      --replace-fail \
        'import { DatabaseSync } from "node:sqlite";' \
        'import { DatabaseSync } from "./bun-sqlite-shim";'
  '';

  nodejs = nodejs_24;
  npmDepsHash = "sha256-bNy+OwKsCbhfIJ5imPAe3XmC+2T5DMGRb5I6gI50YcE=";
  npmDepsFetcherVersion = 2;

  # pi.extensions = ["./index.ts"]; pi loads the TypeScript directly, so the
  # typecheck/lint/test scripts are never consumed and there is no dist/ to
  # produce. diff, file-type, typebox and xxhash-wasm are real runtime imports
  # (src/replace-diff.ts, src/file-kind.ts, src/hashline/hasher.ts) and land in
  # the package's nested node_modules, which is where node resolves them from
  # index.ts. None of them are native or run install scripts.
  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  # No installPhase or postInstall needed, unlike its siblings: upstream's
  # `files` field already limits the pack to index.ts, src/, prompts/, README.md
  # and LICENSE (so test/, eslint.config.js and the banner asset drop out
  # without a hand-written install set, cf. pi-vcc), and the package name is
  # unscoped, so buildNpmPackage installs straight to
  # lib/node_modules/pi-hashline-edit-pro — the path pi.nix's piPackageRoot
  # resolves, with no directory to relocate (cf. pi-tasks).
  #
  # prompts/*.md are load-bearing, not docs: src/read.ts, src/replace.ts and
  # src/replace-undo.ts read them at runtime for tool descriptions.

  meta = {
    description = "Hash-anchored read/replace tools for Pi, replacing the built-in read and edit tools";
    homepage = "https://github.com/YuGiMob/pi-hashline-edit-pro";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
