{
  lib,
  tmuxPlugins,
  rustPlatform,
  fetchFromGitHub,
  python3,
  ...
}:
let
  taw = rustPlatform.buildRustPackage (finalAttrs: {
    pname = "taw";
    version = "0.1.3-unstable-2026-10-29";

    src = fetchFromGitHub {
      owner = "27medkamal";
      repo = "tmux-agent-wizard";
      rev = "1337ff37e8a129682b70bb1c57d3b4b181a1c184";
      hash = "sha256-Eet2v305vdeF7gu4J6JZauYtnq3nM2gIZ5BjGpC/0t8=";
    };

    cargoHash = "sha256-jpOzKekEh6amubUW2U9eMIyNXeiZemKIkpoRSpZ/nVo=";

    doCheck = false;

    # Render the agent hooks with upstream's own installer, so TAW_BIN quoting
    # and file names follow upstream. Keep only the hook files: the agent
    # configs that the installer edits are declared in the agent-wizard
    # home-manager module. A renamed hook file fails `install`.
    postInstall = ''
      export HOME="$TMPDIR/taw-home"
      mkdir -p "$HOME/.claude" "$HOME/.codex" "$HOME/.config/opencode" "$HOME/.pi/agent"
      for agent in claude codex opencode pi; do
        "$out/bin/taw" integration install "$agent" > /dev/null
      done

      share="$out/share/tmux-agent-wizard/integrations"
      install -Dm644 "$HOME/.claude/hooks/taw-agent-state.sh" "$share/claude/taw-agent-state.sh"
      install -Dm644 "$HOME/.codex/taw-agent-state.sh" "$share/codex/taw-agent-state.sh"
      install -Dm644 "$HOME/.config/opencode/plugins/taw-agent-state.js" "$share/opencode/taw-agent-state.js"
      install -Dm644 "$HOME/.config/opencode/taw-tui-session.js" "$share/opencode/taw-tui-session.js"
      install -Dm644 "$HOME/.pi/agent/extensions/taw-agent-state.ts" "$share/pi/taw-agent-state.ts"

      # Without python3 on the agent's PATH, these hooks exit 0 and report nothing.
      for script in "$share/claude/taw-agent-state.sh" "$share/codex/taw-agent-state.sh"; do
        substituteInPlace "$script" \
          --replace-fail 'command -v python3 ' 'command -v ${lib.getExe python3} ' \
          --replace-fail 'python3 - <<' '${lib.getExe python3} - <<'
      done

      for file in "$share"/*/*; do
        if ! grep -qF "$out/bin/taw" "$file"; then
          echo "$file does not name $out/bin/taw" >&2
          exit 1
        fi
        if grep -qF '{{' "$file"; then
          echo "$file has an unrendered placeholder" >&2
          exit 1
        fi
      done
    '';

    meta = {
      description = "Agent awareness for tmux: detection, popup, notifications, and restore";
      homepage = "https://github.com/27medkamal/tmux-agent-wizard";
      # Parts derived from herdr keep herdr's Apache-2.0 licence.
      license = with lib.licenses; [
        mit
        asl20
      ];
      mainProgram = "taw";
      platforms = lib.platforms.unix;
    };
  });
in
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmux-agent-wizard";
  inherit (taw) version src;
  rtpFilePath = "tmux-agent-wizard.tmux";
  # The plugin resolves bin/taw first. It never replaces a link, so it never
  # downloads a release binary over this one.
  postInstall = ''
    mkdir -p $target/bin
    ln -s ${lib.getExe taw} $target/bin/taw
  '';
}
# mkTmuxPlugin replaces `passthru` with its own updateScript.
// {
  inherit taw;
}
