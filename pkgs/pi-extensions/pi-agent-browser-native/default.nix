{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
}:
buildNpmPackage {
  pname = "pi-agent-browser-native";
  version = "0.4.0-unstable-2026-08-07";

  src = fetchFromGitHub {
    owner = "fitchmultz";
    repo = "pi-agent-browser-native";
    rev = "f2d5331ddb1c0145c3a7cfb6a14b0e68ce86b7ac"; # tag v0.3.0
    hash = "sha256-84Ji2cgR5NuarTymM4yRZPIcMuQETIH6g0SSv2azAgQ=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-bk3qA/kv/NBecjLylNeOj7PtwzB2gEGHLAPCS3SQfhc=";
  npmDepsFetcherVersion = 2;
  npmPackFlags = [ "--ignore-scripts" ];

  # Vendor a stripped package.json + regenerated lockfile (mirrors
  # pi-dynamic-workflows / pi-subagents / pi-tasks).
  #
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
  # That is safe because the source imports @earendil-works/pi-coding-agent only
  # as `import type` (AgentToolResult, Theme, ToolResultEvent) — type-only,
  # erased on emit — and @earendil-works/pi-tui via value imports that pi
  # resolves at runtime. We compile with `tsc --noCheck` (the pi-lens pattern) so
  # the stripped peers emit without resolution; the resulting dist/ is
  # byte-identical to a type-checked build (verified: 68159-byte index.js).
  postPatch = ''
    cp ${./package-stripped.json} package.json
    cp ${./package-lock.json} package-lock.json
    # Upstream probes the absolute /bin/ps then /usr/bin/ps paths for process
    # identity, which don't exist on NixOS (ps lives under /run/current-system/sw/bin).
    # Try a PATH-resolved `ps` first; keep the absolute fallbacks for other systems.
    # --replace-fail makes an upstream rename fail the build loudly on version bump.
    substituteInPlace extensions/agent-browser/lib/process-identity.ts \
      --replace-fail ': [primary, { ...primary, file: "/usr/bin/ps" }];' \
                      ': [{ ...primary, file: "ps" }, primary, { ...primary, file: "/usr/bin/ps" }];'
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
