{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_9,
  pnpmConfigHook,
  nodejs_22,
  node-gyp,
  python3,
  makeWrapper,
}:
let
  pnpm = pnpm_9.override { nodejs = nodejs_22; };
in
stdenv.mkDerivation (finalAttrs: {
  pname = "open-design";
  version = "0-unstable-2026-04-30";

  src = fetchFromGitHub {
    owner = "nexu-io";
    repo = "open-design";
    rev = "bd2e71c7089715219b354aadcc3096072d1a477f";
    hash = "sha256-D2dETFZ9HwD1C+uYZjBwGA00F0DZGwQ3jyN/m/HY/Po=";
  };

  nativeBuildInputs = [
    nodejs_22
    node-gyp
    pnpmConfigHook
    pnpm
    python3
    makeWrapper
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 3;
    hash = "sha256-3/fizi7JtC7Xoo192iLiu+f1TkSCSUWyW5A28goj5Zo=";
  };

  postPatch = ''
    substituteInPlace daemon/server.js \
      --replace-fail \
        "const PROJECT_ROOT = path.resolve(__dirname, '..');" \
        "const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_ROOT = process.env.OPEN_DESIGN_STATE_DIR ? path.resolve(process.env.OPEN_DESIGN_STATE_DIR) : process.cwd();" \
      --replace-fail \
        "const ARTIFACTS_DIR = path.join(PROJECT_ROOT, '.od', 'artifacts');" \
        "const ARTIFACTS_DIR = path.join(STATE_ROOT, '.od', 'artifacts');" \
      --replace-fail \
        "const PROJECTS_DIR = path.join(PROJECT_ROOT, '.od', 'projects');" \
        "const PROJECTS_DIR = path.join(STATE_ROOT, '.od', 'projects');" \
      --replace-fail \
        "const db = openDatabase(PROJECT_ROOT);" \
        "const db = openDatabase(STATE_ROOT);"
  '';

  buildPhase = ''
    runHook preBuild
    export npm_config_nodedir=${nodejs_22}
    pushd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3
    ${nodejs_22}/bin/node ${node-gyp}/lib/node_modules/node-gyp/bin/node-gyp.js rebuild --release
    popd
    pnpm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    workspace="$out/lib/node_modules/open-design"
    mkdir -p "$workspace"

    cp -r \
      assets \
      daemon \
      design-systems \
      dist \
      node_modules \
      package.json \
      skills \
      templates \
      "$workspace/"

    makeWrapper ${nodejs_22}/bin/node "$out/bin/od" \
      --add-flags "$workspace/daemon/cli.js"

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
