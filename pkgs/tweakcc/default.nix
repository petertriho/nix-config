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
  version = "0-unstable-2026-03-30";

  src = fetchFromGitHub {
    owner = "Piebald-AI";
    repo = "tweakcc";
    rev = "2bd68d9eb4c63347828ca8e4a31e413cc72a3c4e";
    hash = "sha256-J23uJ7rw5+/YvkBqeAeHE6+bH/Zvh1gC3ZKSQimWVvc=";
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
