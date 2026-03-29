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
  version = "playwriter@0.0.89";

  src = fetchFromGitHub {
    owner = "remorses";
    repo = "playwriter";
    rev = "2d0f01c1c66e46e2805d8d3df38af2656c32bef3";
    fetchSubmodules = true;
    hash = "sha256-C7HX/I/TL0P1RG4VSps3uUCnmY0/oGHFjrlg8uuFMJo=";
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
    hash = "sha256-J6EvRi0cgVSnqwWw4q2l3VpNoHVhmtoJQgOMCLnB4OM=";
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
