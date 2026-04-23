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
  pname = "excalidraw-edit";
  version = "0.1.1-unstable-2026-04-23";

  src = fetchFromGitHub {
    owner = "wh1le";
    repo = "excalidraw-edit";
    rev = "ea8000540f3c15b9559d98f88e6bebdedd28539c";
    hash = "sha256-T7BMgWaPV4cbKPVAPXL++YkWxcp/8GkQxqJockazXlY=";
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
    hash = "sha256-8+jaPMnUB+nDq9+N25JgMYq6mHl4DBLyXRQYbSg6Kww=";
  };

  buildPhase = ''
    runHook preBuild
    pnpm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    workspace="$out/lib/node_modules/excalidraw-edit"
    mkdir -p "$workspace"

    cp -r node_modules "$workspace/"
    cp package.json "$workspace/"
    cp -r src "$workspace/"

    makeWrapper ${nodejs}/bin/node "$out/bin/excalidraw-edit" \
        --add-flags "$workspace/src/cli.js"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Edit .excalidraw files locally in your browser";
    homepage = "https://github.com/wh1le/excalidraw-edit";
    license = licenses.mit;
    mainProgram = "excalidraw-edit";
    maintainers = [ ];
  };
})
