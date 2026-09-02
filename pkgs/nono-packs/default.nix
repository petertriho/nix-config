{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  jq,
  writeShellScript,
}:
let
  piEnsureTempRoot = writeShellScript "nono-pi-ensure-temp-root" ''
    set -eu

    tempRoot=/tmp/pi
    if [ ! -e "$tempRoot" ]; then
      mkdir -p -m 700 "$tempRoot"
    fi

    if [ ! -d "$tempRoot" ] || [ ! -O "$tempRoot" ]; then
      echo "nono-pi: $tempRoot must be a directory owned by the current user" >&2
      exit 1
    fi

    chmod 700 "$tempRoot"
  '';

  # One immutable source for all three agent packs. This commit, its hash, and
  # the version below move together — see ./README.md for the update workflow.
  # `nono update` / `nnu` do NOT touch these packs; they are not registry-managed.
  src = fetchFromGitHub {
    owner = "nolabs-ai";
    repo = "nono-packs";
    rev = "745afd62cd0ed97534f1aab09252b6dbf6958e06";
    hash = "sha256-+vjtv9yOMvugKWPr0F6I2ATWOLo1ujO9kp5A4Hng770=";
  };
in
stdenvNoCC.mkDerivation {
  pname = "nono-packs";
  version = "antigravity-v0.3.2-unstable-2026-09-02";

  inherit src;

  nativeBuildInputs = [ jq ];

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    packsDir="$out/share/nono-packs/packs"
    profilesDir="$out/share/nono-packs/profiles"
    mkdir -p "$packsDir" "$profilesDir"

    # Assert helper: fail the build with a clear message when an expectation
    # is not met, so an upstream manifest drift cannot leave stale wiring.
    expect() {
      if ! "$@" >/dev/null 2>&1; then
        echo "nono-packs: manifest/wiring drift check failed: $*" >&2
        exit 1
      fi
    }

    # ----- shared manifest checks ----------------------------------------
    check_common() {
      local pack="$1" manifest="$src/$1/package.json"
      expect jq -e '.schema_version == 1' "$manifest"
      expect jq -e --arg name "$pack" '.name == $name' "$manifest"
      expect jq -e --arg name "$pack" \
        '.artifacts | any(.type == "profile" and .path == "policy.json" and .install_as == $name)' \
        "$manifest"

      while IFS= read -r artifact; do
        expect test -e "$src/$pack/$artifact"
      done < <(jq -r '.artifacts[].path' "$manifest")
    }

    for pack in claude pi opencode; do
      check_common "$pack"
    done

    # ----- claude: Home Manager-managed personal plugin ------------------
    cm="$src/claude/package.json"
    expect jq -e '
      [
        ".claude-plugin/plugin.json",
        "hooks/hooks.json",
        "bin/nono-hook.sh",
        "bin/nono-hook-bash.sh",
        "skills/nono-sandbox/SKILL.md"
      ] - [.artifacts[] | select(.type == "plugin") | .path]
      | length == 0
    ' "$cm"
    expect jq -e '.name == "nono" and (.version | type == "string")' \
      "$src/claude/.claude-plugin/plugin.json"
    expect jq -e '
      .hooks.PostToolUseFailure
      | any(.hooks | any(.command == "''${CLAUDE_PLUGIN_ROOT}/bin/nono-hook.sh"))
    ' "$src/claude/hooks/hooks.json"
    expect jq -e '
      .hooks.PostToolUse
      | any(.hooks | any(.command == "''${CLAUDE_PLUGIN_ROOT}/bin/nono-hook-bash.sh"))
    ' "$src/claude/hooks/hooks.json"

    # ----- pi: package loaded straight from the store --------------------
    pm="$src/pi/package.json"
    expect jq -e '.pi.extensions == ["extensions"] and .pi.skills == ["skills"]' "$pm"
    expect jq -e '.wiring | any(
      .type == "json_array_append"
      and .file == "$HOME/.pi/agent/settings.json"
      and .path == "packages")' "$pm"
    expect jq -e '
      [
        "extensions/nono-sandbox.ts",
        "skills/nono-sandbox/SKILL.md",
        "wiring/packages-entry.json"
      ] - [.artifacts[] | select(.type == "plugin") | .path]
      | length == 0
    ' "$pm"
    expect jq -e '. == [{"source": "$PACK_DIR"}]' "$src/pi/wiring/packages-entry.json"
    expect test -f "$src/pi/extensions/nono-sandbox.ts"
    expect test -d "$src/pi/skills/nono-sandbox"

    # ----- opencode: plugin, skill, and the ensure-dirs before-hook ------
    om="$src/opencode/package.json"
    expect jq -e '.wiring | any(
      .type == "symlink"
      and .link == "$XDG_CONFIG_HOME/opencode/plugins/nono-sandbox.ts"
      and .target == "$PACK_DIR/plugin/nono-sandbox.ts")' "$om"
    expect jq -e '.wiring | any(
      .type == "symlink"
      and .link == "$XDG_CONFIG_HOME/opencode/skills/nono-sandbox"
      and .target == "$PACK_DIR/skills/nono-sandbox")' "$om"
    expect jq -e '
      [
        "plugin/nono-sandbox.ts",
        "bin/ensure-dirs.sh",
        "skills/nono-sandbox/SKILL.md"
      ] - [.artifacts[] | select(.type == "plugin") | .path]
      | length == 0
    ' "$om"
    expect jq -e '.session_hooks.before.script == "$PACK_DIR/bin/ensure-dirs.sh"' "$src/opencode/policy.json"
    expect test -f "$src/opencode/plugin/nono-sandbox.ts"
    expect test -d "$src/opencode/skills/nono-sandbox"
    expect test -f "$src/opencode/bin/ensure-dirs.sh"

    # ----- copy only the three selected packs ----------------------------
    cp -r "$src/claude" "$packsDir/claude"
    cp -r "$src/pi" "$packsDir/pi"
    cp -r "$src/opencode" "$packsDir/opencode"

    # Ensure hook scripts remain executable through the copy.
    chmod +x "$packsDir/claude/bin/nono-hook.sh" "$packsDir/claude/bin/nono-hook-bash.sh"
    chmod +x "$packsDir/opencode/bin/ensure-dirs.sh"

    # ----- generate ordinary local base profiles -------------------------
    # Each profile renames itself, appends its immutable pack directory to
    # filesystem.read (nono does not follow symlinks below a granted path),
    # and — for OpenCode only — rewrites the before-hook to the store path.
    gen_profile() {
      local pack="$1" base="$2"
      jq --arg name "$base" --arg dir "$packsDir/$pack" '
        .meta.name = $name
        | .filesystem.read = ((.filesystem.read // []) + [$dir])
      ' "$src/$pack/policy.json" > "$profilesDir/$base.json"
      expect jq -e . "$profilesDir/$base.json"
      expect jq -e --arg name "$base" '.meta.name == $name' "$profilesDir/$base.json"
    }

    gen_profile claude nono-claude-base
    gen_profile pi nono-pi-base

    # Pi extensions create jiti caches and other temporary files. Keep them in
    # one private /tmp root instead of granting read access to all of /tmp. The
    # host-side hook creates the root first because nono ignores grants for paths
    # that do not exist when the sandbox starts.
    piProfile="$profilesDir/nono-pi-base.json"
    jq --arg hook "${piEnsureTempRoot}" '
      .filesystem.allow = ((.filesystem.allow // []) + ["/tmp/pi"] | unique)
      | .environment.set_vars.TMPDIR = "/tmp/pi"
      | .session_hooks.before = {
          script: $hook,
          timeout_secs: 5
        }
    ' "$piProfile" > "$piProfile.tmp"
    mv "$piProfile.tmp" "$piProfile"
    expect jq -e --arg hook "${piEnsureTempRoot}" '
      ((.filesystem.allow | index("/tmp/pi")) != null)
      and (.environment.set_vars.TMPDIR == "/tmp/pi")
      and (.session_hooks.before.script == $hook)
    ' "$piProfile"

    jq \
      --arg name "nono-opencode-base" \
      --arg dir "$packsDir/opencode" \
      --arg hook "$packsDir/opencode/bin/ensure-dirs.sh" '
        .meta.name = $name
        | .filesystem.read = ((.filesystem.read // []) + [$dir])
        | .session_hooks.before.script = $hook
      ' "$src/opencode/policy.json" > "$profilesDir/nono-opencode-base.json"
    expect jq -e . "$profilesDir/nono-opencode-base.json"
    expect jq -e '.meta.name == "nono-opencode-base"' "$profilesDir/nono-opencode-base.json"
    expect jq -e --arg hook "$packsDir/opencode/bin/ensure-dirs.sh" \
      '.session_hooks.before.script == $hook' "$profilesDir/nono-opencode-base.json"

    # Confirm the OpenCode hook inside the output is executable.
    expect test -x "$packsDir/opencode/bin/ensure-dirs.sh"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Pinned nolabs-ai nono packs for Claude, Pi, and OpenCode";
    homepage = "https://github.com/nolabs-ai/nono-packs";
    license = licenses.asl20;
    maintainers = [ ];
    platforms = platforms.all;
  };
}
