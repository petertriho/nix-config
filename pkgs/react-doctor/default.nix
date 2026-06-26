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
  pname = "react-doctor";
  version = "2.2.2-unstable-2026-06-25";

  src = fetchFromGitHub {
    owner = "millionco";
    repo = "react-doctor";
    rev = "e2393c4a6b842efc72d5c225273c0de918a13450";
    hash = "sha256-ga+uargSDuPUjQqGNqEMI4EnulQ7PzucKbZvJItL5Xo=";
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
    hash = "sha256-XtRhlkukE6zOatsNw7i5nBcspDzv81R1TCx85NJZi0I=";
  };

  buildPhase = ''
    runHook preBuild

    pnpm --dir packages/oxlint-plugin-react-doctor run build
    pnpm --dir packages/core run build
    pnpm --dir packages/api run build
    pnpm --dir packages/react-doctor run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    workspace="$out/lib/node_modules/react-doctor-workspace"
    mkdir -p "$workspace"

    cp -r LICENSE node_modules package.json packages pnpm-workspace.yaml "$workspace/"

    makeWrapper ${nodejs}/bin/node "$out/bin/react-doctor" \
      --add-flags "$workspace/packages/react-doctor/bin/react-doctor.js"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Diagnose and fix React codebases for security, performance, correctness, accessibility, bundle-size, and architecture issues";
    homepage = "https://github.com/millionco/react-doctor";
    license = licenses.mit;
    mainProgram = "react-doctor";
    maintainers = [ ];
  };
})
