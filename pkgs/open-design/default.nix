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
  version = "open-design-v0.3.1-beta.5-unstable-2026-05-05";

  src = fetchFromGitHub {
    owner = "nexu-io";
    repo = "open-design";
    rev = "c3d9136a0c2b5b118699bc79267a1f0ffef957db";
    hash = "sha256-lV7si+3CF+NO5t0douUnzKWlHRDGAsP2VMXirqzKqLw=";
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
    hash = "sha256-z6FsL7JIy0wEXDPvQgahlY9JbzV4ssx7K1/+fpS+mGA=";
  };

  buildPhase = ''
    runHook preBuild

    # Manually rebuild better-sqlite3 native bindings (pnpm rebuild doesn't work in nix builds)
    export npm_config_nodedir=${nodejs_24}
    for dir in node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3; do
      [ -d "$dir" ] || continue
      pushd "$dir"
      ${nodejs_24}/bin/node ${node-gyp}/lib/node_modules/node-gyp/bin/node-gyp.js rebuild --release
      popd
    done

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
