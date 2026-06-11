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
  version = "2.1.0-unstable-2026-06-11";

  src = fetchFromGitHub {
    owner = "millionco";
    repo = "react-doctor";
    rev = "a48fb06ffbe7221655e18529fcc954ecae17a22f";
    hash = "sha256-id4Se8DCDDLgTjfsDnInI1sBnHfi3YiEvJ9xKMYQUcg=";
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
    hash = "sha256-cuEO+XS5R5i8WabVUvqPysVHo/oQP17wRx0mNVvHAEE=";
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
