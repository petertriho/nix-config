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
  version = "playwriter@0.5.0";

  src = fetchFromGitHub {
    owner = "remorses";
    repo = "playwriter";
    rev = finalAttrs.version;
    fetchSubmodules = true;
    hash = "sha256-TJDcwzgTVb4OvWEP885FcNY1VBrIpXuu2n81FtP0Bic=";
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
    hash = "sha256-w5iwg6M6FOXQ0lCkE/7Y8B6Tf2ZKA5sSPlBnr5q5iqo=";
  };

  postPatch = ''
    substituteInPlace extension/package.json \
        --replace-fail " && tsx scripts/download-prism.ts" ""
    substituteInPlace extension/src/welcome.html \
        --replace-fail '<script src="prism.min.js"></script>' "" \
        --replace-fail '<script src="prism-bash.min.js"></script>' ""
  '';

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
    mkdir -p "$workspace/holocron"
    cp holocron/package.json "$workspace/holocron/"

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
