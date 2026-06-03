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
let
  pnpm = pnpm_10.override { inherit nodejs; };
in
stdenv.mkDerivation (finalAttrs: {
  pname = "react-doctor";
  version = "1.1.1-unstable-2026-06-03";

  src = fetchFromGitHub {
    owner = "millionco";
    repo = "react-doctor";
    rev = "3c05fc4d63993055469e8c8a18f151ba95a3a36e";
    hash = "sha256-s2QwfQUfQF/+5L5o2745IATh9mJ36fhNnUT3x0pZ2KA=";
  };

  nativeBuildInputs = [
    nodejs
    pnpmConfigHook
    pnpm
    makeWrapper
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 3;
    hash = "sha256-iBDqEEyYANt5kUgh+W7MSz4gRlAAXwsQopkK7lc8Qd0=";
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

    cp -r node_modules package.json packages pnpm-workspace.yaml "$workspace/"

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
