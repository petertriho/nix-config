{
  lib,
  stdenv,
  claude-code,
  tweakcc,
  tweakccConfig,
  makeBinaryWrapper,
  binutils,
}:
stdenv.mkDerivation {
  pname = "claude-custom";
  version = claude-code.version or "0";

  dontUnpack = true;
  dontConfigure = true;

  nativeBuildInputs = [
    tweakcc
    makeBinaryWrapper
    binutils
  ];

  installPhase = ''
    set -euo pipefail

    mkdir -p "$out"
    cp -r ${claude-code}/. "$out"
    chmod -R u+w "$out"

    export TWEAKCC_CONFIG_DIR
    TWEAKCC_CONFIG_DIR=$(mktemp -d)
    cp ${tweakccConfig} "$TWEAKCC_CONFIG_DIR/config.json"
    chmod u+w "$TWEAKCC_CONFIG_DIR/config.json"

    claudeInstallationPath="$out/bin/claude"
    for candidate in "$out"/bin/.claude-*; do
        if [ -f "$candidate" ]; then
            claudeInstallationPath="$candidate"
            break
        fi
    done

    export TWEAKCC_CC_INSTALLATION_PATH="$claudeInstallationPath"
    tweakcc --apply 2> /dev/null || true

    if [ "$claudeInstallationPath" != "$out/bin/claude" ]; then
        substituteInPlace "$out/bin/claude" \
            --replace-fail "${claude-code}/bin/$(basename "$claudeInstallationPath")" "$claudeInstallationPath"
    fi
  '';

  meta = with lib; {
    description = "Claude Code with tweakcc customizations applied";
    license = licenses.unfree;
    mainProgram = "claude";
  };
}
