{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_10,
  pnpmConfigHook,
  nodejs_24,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "pi-blackhole";
  version = "0.4.3-unstable-2026-08-02";

  src = fetchFromGitHub {
    owner = "k0valik";
    repo = "pi-blackhole";
    rev = "2bf8cda11585c21fef2e5c2d9210690d82a2f2ca";
    hash = "sha256-MBCSviHt6Q53A2uYbANrDnBXk1MlgZHQqwaz+va2tmQ=";
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-aTK8T1N/6KbtmT8vpOIOoByjRtRVgyMj+ERBVX/PFK0=";
  };

  nativeBuildInputs = [
    nodejs_24
    pnpmConfigHook
    pnpm_10
  ];

  # `pnpm build` runs `tsup` (see upstream tsup.config.ts), bundling index.ts
  # → dist/index.js (ESM + sourcemap). tsup externalizes the
  # @earendil-works/* peers and @sinclair/typebox, which Pi injects at
  # runtime. The upstream `prepare` script only wraps tsup + husky, so it is
  # subsumed by this direct invocation and never needs to run during the
  # build.
  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  # Install layout mirrors the upstream package.json `files` field. src/ is
  # required at runtime: pi-blackhole's OM consolidation agents are loaded
  # via jiti from src/om/. Test files are pruned to match upstream's
  # `!src/**/*.test.ts` exclusion.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-blackhole
    mkdir -p "$packageRoot"
    cp package.json LICENSE README.md example-config.json "$packageRoot/"
    cp index.ts "$packageRoot/"
    cp -r dist "$packageRoot/"
    cp -r src "$packageRoot/"
    find "$packageRoot/src" -name "*.test.ts" -delete

    runHook postInstall
  '';

  meta = {
    description = "Unified algorithmic compaction + observational memory extension for Pi";
    homepage = "https://github.com/k0valik/pi-blackhole";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
})
