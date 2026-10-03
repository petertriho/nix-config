{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  jq,
  nodejs,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "pi-goal-x";
  version = "0.32.3-unstable-2026-10-02";

  # Pinned snapshot of upstream main.
  src = fetchFromGitHub {
    owner = "tmonk";
    repo = "pi-goal-x";
    rev = "64c5ace87f3400c0b55ef87f2d2912167f53dbaa";
    hash = "sha256-d0IRFiK5JH/VDimVEdJFE/+5i4lDlPLXITvcbCpixt0=";
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
