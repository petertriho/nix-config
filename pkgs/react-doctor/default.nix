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
  version = "2.0.1-unstable-2026-06-06";

  src = fetchFromGitHub {
    owner = "millionco";
    repo = "react-doctor";
    rev = "6216430f93404489f6a56b4d0a7c196beb86623a";
    hash = "sha256-rJo828jEXM3Vu9+wGYJbJN5BIObW3eMeY/XRBgPQ8g8=";
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
    hash = "sha256-lxH9lPzYuBYIDqV0+B++Gyq08Q7khMcQ4PEidWIb6Uc=";
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
