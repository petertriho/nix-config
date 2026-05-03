{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_10,
  pnpmConfigHook,
  nodejs_24,
  node-gyp,
  python3,
  makeWrapper,
  darwin,
}:
let
  pnpm = pnpm_10.override { nodejs = nodejs_24; };
in
stdenv.mkDerivation (finalAttrs: {
  pname = "open-design";
  version = "open-design-v0.2.0-unstable-2026-05-03";

  src = fetchFromGitHub {
    owner = "nexu-io";
    repo = "open-design";
    rev = "648374d8398ef88a6414d24c09d30633acdf509f";
    hash = "sha256-D4puv/shMGV2wt/lCvQrYjjxSCmx99ARgp1NTd8bCvM=";
  };

  nativeBuildInputs = [
    nodejs_24
    node-gyp
    pnpmConfigHook
    pnpm
    python3
    makeWrapper
  ]
  ++ lib.optionals stdenv.hostPlatform.isDarwin [ darwin.cctools ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 3;
    hash = "sha256-+aXODhoOgjnd5WpRoWufwCEVER4xUZHeZKZkmGWHUPo=";
  };

  buildPhase = ''
    runHook preBuild

    # Manually rebuild better-sqlite3 native bindings (pnpm rebuild doesn't work in nix builds)
    export npm_config_nodedir=${nodejs_24}
    pushd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3
    ${nodejs_24}/bin/node ${node-gyp}/lib/node_modules/node-gyp/bin/node-gyp.js rebuild --release
    popd

    # Build workspace packages that downstream apps depend on
    pnpm --filter @open-design/platform run build
    pnpm --filter @open-design/sidecar-proto run build
    pnpm --filter @open-design/sidecar run build

    # Build the daemon and the static web export
    pnpm --filter @open-design/daemon run build
    pnpm --filter @open-design/web run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    workspace="$out/lib/node_modules/open-design"
    mkdir -p "$workspace"

    cp -r \
      apps \
      assets \
      design-systems \
      node_modules \
      package.json \
      packages \
      pnpm-workspace.yaml \
      skills \
      templates \
      "$workspace/"

    # Remove dangling symlinks to packages we don't install
    rm -f \
      "$workspace/node_modules/.pnpm/node_modules/@open-design/e2e" \
      "$workspace/node_modules/@open-design/tools-dev" \
      "$workspace/node_modules/@open-design/tools-pack"

    makeWrapper ${nodejs_24}/bin/node "$out/bin/od" \
      --run 'export OD_DATA_DIR="''${OD_DATA_DIR:-$PWD/.od}"' \
      --add-flags "$workspace/apps/daemon/dist/cli.js"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Local-first design product powered by existing code-agent CLIs";
    homepage = "https://github.com/nexu-io/open-design";
    license = licenses.asl20;
    mainProgram = "od";
    maintainers = [ ];
  };
})
