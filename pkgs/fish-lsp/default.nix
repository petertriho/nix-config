{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchYarnDeps,
  yarnBuildHook,
  yarnConfigHook,
  npmHooks,
  nodejs,
  installShellFiles,
  makeWrapper,
  fish,
  which,
}:
stdenv.mkDerivation rec {
  pname = "fish-lsp";
  version = "unstable-2024-07-26";

  src = fetchFromGitHub {
    owner = "ndonfris";
    repo = "fish-lsp";
    rev = "v1.0.8-1";
    hash = "sha256-u125EZXQEouVbmJuoW3KNDNqLB5cS/TzblXraClcw6Q=";
  };

  yarnOfflineCache = fetchYarnDeps {
    yarnLock = src + "/yarn.lock";
    hash = "sha256-hHw7DbeqaCapqx4dK5Y3sPut94ist9JOU8g9dd6gBdo=";
  };

  nativeBuildInputs = [
    yarnBuildHook
    yarnConfigHook
    npmHooks.npmInstallHook
    nodejs
    installShellFiles
    makeWrapper
    # fish-lsp dependencies
    fish
    which
  ];

  yarnBuildScript = "setup";

  postBuild =
    # sh
    ''
      yarn --offline compile
    '';

  installPhase =
    # sh
    ''
      runHook preInstall

      mkdir -p $out/$pname

      cp -r . $out/$pname

      makeWrapper ${lib.getExe nodejs} "$out/bin/fish-lsp" \
        --add-flags "$out/$pname/out/cli.js"

      installShellCompletion --cmd fish-lsp \
        --fish <($out/bin/fish-lsp complete --fish)

      runHook postInstall
    '';
}
