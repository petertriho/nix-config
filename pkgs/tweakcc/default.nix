{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_10,
  pnpmConfigHook,
  nodejs,
  makeWrapper,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "tweakcc";
  version = "4.0.11-unstable-2026-04-16";

  src = fetchFromGitHub {
    owner = "Piebald-AI";
    repo = "tweakcc";
    rev = "5428f554727d8bdacfb754568874626493c6d6ef";
    hash = "sha256-hxNsNuNnzr1Pk0FUszqQM3Ld7XPACqLWwI3p2N3XBsY=";
  };

  nativeBuildInputs = [
    nodejs
    pnpmConfigHook
    pnpm_10
    makeWrapper
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-arabUo9xOCz/fbneybXYDVZBUkWd+z1A/DSXgiKUPqE=";
  };

  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/lib/node_modules/tweakcc"
    cp -r dist node_modules package.json "$out/lib/node_modules/tweakcc/"

    makeWrapper ${nodejs}/bin/node "$out/bin/tweakcc" \
        --add-flags "$out/lib/node_modules/tweakcc/dist/index.mjs"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Customize Claude Code's system prompts, themes, thinking verbs, and more";
    homepage = "https://github.com/Piebald-AI/tweakcc";
    license = licenses.mit;
    mainProgram = "tweakcc";
    maintainers = [ ];
  };
})
