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
  version = "0.18.0-unstable-2026-11-17";

  src = fetchFromGitHub {
    owner = "vercel-labs";
    repo = "portless";
    rev = "e1bce49f12c1498f9d274cf9ad804495bad70ed6";
    hash = "sha256-Ni/tG1xKmollJkeJK8GfMtSS/Al3XG47/a95zDOsPVQ=";
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
    hash = "sha256-8Vcbu4KKeDJpu1HvyZz/WBRhDKMVJHTcXgueyLqDEMc=";
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
