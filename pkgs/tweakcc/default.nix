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
    rev = "c22e4e5eaffaf0731922d9001b2a531eb1d4edaf";
    hash = "sha256-0mOSpOpn12xgiP6WBIz2TYHQfUwbMOhMey5Dt+FbCsE=";
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
