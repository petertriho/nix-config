{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  jq,
  nodejs,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "pi-goal-x";
  version = "0.34.1-unstable-2026-10-27";

  # Pinned snapshot of upstream main.
  src = fetchFromGitHub {
    owner = "tmonk";
    repo = "pi-goal-x";
    rev = "b0fc15ebb658a1e9ea60ae65496717a780080f37";
    hash = "sha256-dU4Dk/Q+FroU9WDQbhqRv7qw+pwQRouZX6XM6efxT9o=";
  };

  nativeBuildInputs = [
    jq
    nodejs
  ];
  dontConfigure = true;
  dontBuild = true;

  # Pi loads the TypeScript directly and supplies all peer dependencies.
  # Copy the published files without installing development dependencies.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-goal-x
    mkdir -p "$packageRoot"
    cp package.json CHANGELOG.md "$packageRoot/"
    jq -r '.files[]' package.json | while IFS= read -r file; do
      cp -r --parents "$file" "$packageRoot/"
    done

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck

    packageRoot=$out/lib/node_modules/pi-goal-x
    jq -e '
      .name == "pi-goal-x"
      and .version == "${lib.head (lib.splitString "-unstable-" finalAttrs.version)}"
      and ((.dependencies // {}) | length == 0)
    ' "$packageRoot/package.json" > /dev/null
    jq -r '.pi.extensions[], .files[]' "$packageRoot/package.json" | while IFS= read -r file; do
      test -e "$packageRoot/$file"
    done
    test ! -e "$packageRoot/node_modules"
    node "$packageRoot/scripts/recover-session-checkpoints.mjs" --help > /dev/null

    runHook postInstallCheck
  '';

  meta = {
    description = "Goal planning and autonomous execution for Pi with persistent progress and completion auditing";
    homepage = "https://github.com/tmonk/pi-goal-x";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
})
