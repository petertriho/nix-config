{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_10,
  pnpmConfigHook,
  nodejs,
  bun,
  typescript,
  makeWrapper,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "playwriter";
  version = "playwriter@0.0.89-unstable-2026-03-24";

  src = fetchFromGitHub {
    owner = "remorses";
    repo = "playwriter";
    rev = "0b75e829b49ce98b099372e34258fe0849355302";
    fetchSubmodules = true;
    hash = "sha256-ecL2IXt+WZBMiUH+KEfN5ookgD793c4oy9pV7ktBndw=";
  };

  nativeBuildInputs = [
    nodejs
    pnpmConfigHook
    pnpm_10
    bun
    typescript
    makeWrapper
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-bwmkLsQcKaEKBTfpL29gYJyfv1V4V9ZhNaoMWGwfZ4Q=";
  };

  buildPhase = ''
    runHook preBuild
    node playwright/utils/generate_injected.js
    node playwright/packages/playwright-core/build.mjs
    pnpm --filter playwriter build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    workspace="$out/lib/node_modules/playwriter-workspace"
    mkdir -p "$workspace/playwriter/src" "$workspace/playwright/packages" "$workspace/extension" "$workspace/website" "$out/share/playwriter"

    cp -r node_modules "$workspace/"
    cp package.json pnpm-workspace.yaml "$workspace/"
    cp -r playwriter "$workspace/"
    cp -r playwright/packages/playwright-core "$workspace/playwright/packages/"
    cp extension/package.json "$workspace/extension/"
    cp website/package.json "$workspace/website/"

    rm -rf "$workspace/playwriter/src"
    mkdir -p "$workspace/playwriter/src"
    cp playwriter/src/skill.md "$workspace/playwriter/src/"

    makeWrapper ${nodejs}/bin/node "$out/bin/playwriter" \
        --add-flags "$workspace/playwriter/bin.js"

    cp -r skills "$out/share/playwriter/"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Chrome extension and CLI for controlling your browser with Playwright snippets";
    homepage = "https://github.com/remorses/playwriter";
    license = licenses.mit;
    mainProgram = "playwriter";
    maintainers = [ ];
  };
})
