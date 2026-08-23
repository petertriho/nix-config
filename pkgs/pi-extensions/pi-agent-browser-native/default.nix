{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  stripNpmManifest,
}:
buildNpmPackage {
  pname = "pi-agent-browser-native";
  version = "0.5.0-unstable-2026-08-22";

  src = fetchFromGitHub {
    owner = "fitchmultz";
    repo = "pi-agent-browser-native";
    rev = "f4736a99b59a4d8e86722eb69cc30c337c567805"; # tag v0.5.0
    hash = "sha256-qqBHe09tv03zieKN1U51kH0zp8TP7Xm7BXnML7efVqA=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-bk3qA/kv/NBecjLylNeOj7PtwzB2gEGHLAPCS3SQfhc=";
  npmDepsFetcherVersion = 2;
  npmPackFlags = [ "--ignore-scripts" ];

  # Upstream declares @earendil-works/* as peerDependencies (injected by pi at
  # runtime) AND as devDependencies (for type-checking). pi-coding-agent's own
  # nested transitive deps land in package-lock.json with `resolved` but no
  # `integrity`, which panics nixpkgs' npm fetcher ("non-git dependencies
  # should have associated integrity"). Regenerating the lockfile does not
  # backfill them; stripping the peerDependencies does not remove them. The only
  # fix is to drop pi-coding-agent from the build entirely, which collapses the
  # closure from 279 locked packages to 4 (no more pi-coding-agent's aws-sdk /
  # anthropic tree) and yields a clean, integrity-complete lockfile.
  #
  # package.json is stripped in place rather than vendored (mirrors
  # pi-dynamic-workflows / pi-subagents / pi-tasks), so pi.extensions/files
  # track the pinned rev. On top of the usual dev+peer strip, this one:
  #   - keeps only the typescript/@types/node devDependencies the build runs
  #     (tsc from node_modules),
  #   - drops `overrides`, because the vendored lockfile was resolved without
  #     them and npm ci enforces lockfile/manifest sync including overrides.
  #
  # That is safe because the source imports @earendil-works/pi-coding-agent only
  # as `import type` (AgentToolResult, Theme, ToolResultEvent) — type-only,
  # erased on emit — and @earendil-works/pi-tui via value imports that pi
  # resolves at runtime. We compile with `tsc --noCheck` (the pi-lens pattern)
  # so the stripped peers emit without resolution; the resulting dist/ is
  # byte-identical to a type-checked build (verified: 68159-byte index.js).
  postPatch =
    stripNpmManifest {
      stripFields = [
        "peerDependencies"
        "peerDependenciesMeta"
        "overrides"
      ];
      extraJqOps = [
        ''.devDependencies |= with_entries(select(.key == "typescript" or .key == "@types/node"))''
      ];
      lockfile = ./package-lock.json;
    }
    + ''
      # Upstream probes absolute /bin/ps then /usr/bin/ps for process identity,
      # which don't exist on NixOS (ps lives under /run/current-system/sw/bin).
      # v0.5.0 folded this into buildProcessStartIdentityCommand's ternary: make
      # the non-android primary a PATH-resolved `ps`; the /usr/bin/ps fallback in
      # buildProcessStartIdentityCommands stays for other systems.
      # --replace-fail makes an upstream rename fail the build loudly on version bump.
      substituteInPlace extensions/agent-browser/lib/process-identity.ts \
        --replace-fail ': platform === "android" ? join(dirname(process.execPath), "ps") : "/bin/ps",' \
                        ': platform === "android" ? join(dirname(process.execPath), "ps") : "ps",'
    '';

  # Override the default `npm run build` (build.mjs → plain tsc, which would
  # type-check and fail on the now-stripped peers) with a --noCheck emit, as
  # pi-lens does. Output is identical; only semantic type-checking is skipped.
  buildPhase = ''
    runHook preBuild

    rm -rf dist
    ./node_modules/.bin/tsc -p tsconfig.build.json --noCheck

    runHook postBuild
  '';

  # Default installPhase runs `npm pack` (respecting npmPackFlags) and unpacks
  # the package.json `files` whitelist (dist/, scripts/, docs) into
  # lib/node_modules/<pname> with devDeps omitted. No postInstall needed: the
  # unscoped npm name installs directly at the path piPackageRoot expects.

  meta = {
    description = "Pi extension exposing agent-browser as a native agent_browser tool for browser automation";
    homepage = "https://github.com/fitchmultz/pi-agent-browser-native";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = "pi-agent-browser-doctor";
  };
}
