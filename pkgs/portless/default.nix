{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_11,
  pnpmConfigHook,
  nodejs,
  makeWrapper,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "portless";
  version = "0.18.1-unstable-2026-11-28";

  src = fetchFromGitHub {
    owner = "vercel-labs";
    repo = "portless";
    rev = "6aa7bf2656abd385fed065ed52516c9acb111830";
    hash = "sha256-02lLSiCyykpCNscoNl1Bb93XF64iCLS3e0KrndXf2Sc=";
  };

  # The workspace also holds the Next.js docs site, tests, and examples.
  # Only the published CLI package is built.
  pnpmWorkspaces = [ "portless" ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs)
      pname
      version
      src
      pnpmWorkspaces
      ;
    pnpm = pnpm_11;
    fetcherVersion = 5;
    hash = "sha256-hirSn/Wx6GiqyolK7bVHoDpqys4XNDspTKqSc9mVxGQ=";
  };

  nativeBuildInputs = [
    nodejs
    pnpmConfigHook
    pnpm_11
    makeWrapper
  ];

  env = {
    HUSKY = "0";
    TURBO_TELEMETRY_DISABLED = "1";
  };

  # Upstream runs `tsup && tsc -p tsconfig.build.json`. The `tsc` step only
  # emits declaration files, which the CLI does not use.
  buildPhase = ''
    runHook preBuild
    pnpm --filter portless exec tsup
    runHook postBuild
  '';

  # The tsup bundle imports only Node.js builtins, so no node_modules ship.
  installPhase = ''
    runHook preInstall

    packageRoot="$out/lib/node_modules/portless"
    mkdir -p "$packageRoot" "$out/share/portless/skills"
    cp -r packages/portless/dist packages/portless/package.json "$packageRoot/"

    makeWrapper ${lib.getExe nodejs} "$out/bin/portless" \
      --add-flags "$packageRoot/dist/cli.js"

    cp -r skills/portless skills/oauth "$out/share/portless/skills/"

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    "$out/bin/portless" --version
    "$out/bin/portless" --help > /dev/null
    test -f "$out/share/portless/skills/portless/SKILL.md"
    test -f "$out/share/portless/skills/oauth/SKILL.md"
    runHook postInstallCheck
  '';

  meta = {
    description = "Replace port numbers with stable, named .localhost URLs";
    homepage = "https://portless.sh";
    changelog = "https://github.com/vercel-labs/portless/blob/main/CHANGELOG.md";
    license = lib.licenses.asl20;
    mainProgram = "portless";
    platforms = lib.platforms.darwin ++ lib.platforms.linux;
  };
})
