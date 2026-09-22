{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.codex;

  # Upstream uses this path while Home Manager does not prefer XDG directories.
  # Update this module if the upstream path changes.
  configFile = ".codex/config.toml";
  configPath = "${config.home.homeDirectory}/${configFile}";

  # Keep the generated upstream TOML as the overlay after disabling its symlink.
  codexConfigSource = builtins.tryEval config.home.file."${configFile}".source;
  codexConfigNix = if codexConfigSource.success then codexConfigSource.value else null;

  codexMergeConfig = ./codex-merge-config.py;
  codexPython = pkgs.python3.withPackages (ps: [ ps.tomlkit ]);
in
{
  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = codexConfigNix != null;
        message = "programs.codex requires the upstream ${configFile} source for its mutable config";
      }
    ];

    programs.codex.settings = {
      theme = "ansi";
      personality = "pragmatic";
      features.multi_agent = true;
      tui.status_line = [
        "model-with-reasoning"
        "context-remaining"
        "context-window-size"
        "five-hour-limit"
        "weekly-limit"
        "total-input-tokens"
        "total-output-tokens"
        "used-tokens"
        "current-dir"
      ];
    };

    # The activation entry owns this mutable file.
    home.file."${configFile}".enable = false;

    # Preserve runtime keys and comments. Nix values take precedence.
    home.activation.codexMutableConfig = lib.mkIf (codexConfigNix != null) (
      lib.hm.dag.entryAfter [ "linkGeneration" ] ''
        codexConfigFile=${lib.escapeShellArg configPath}
        codexConfigNix=${codexConfigNix}
        codexPython=${codexPython}/bin/python3
        codexMergeConfig=${codexMergeConfig}

        # Replace the target atomically and keep the temporary file private.
        function codexWriteConfig {
          local target="$1"
          local tmp
          tmp=$(mktemp "$target.tmp.XXXXXX") || return 1

          if ! cat > "$tmp" || ! mv "$tmp" "$target"; then
            rm -f "$tmp"
            return 1
          fi
        }

        # Remove a stale symlink if linkGeneration did not remove it.
        if [[ -L "$codexConfigFile" ]]; then
          run rm $VERBOSE_ARG "$codexConfigFile"
        fi

        run mkdir -p $VERBOSE_ARG "$(dirname "$codexConfigFile")"

        if [[ -f "$codexConfigFile" && ! -L "$codexConfigFile" ]]; then
          if codexMerged=$("$codexPython" "$codexMergeConfig" "$codexConfigFile" "$codexConfigNix"); then
            :
          elif [[ $? -eq 3 ]]; then
            warnEcho "$codexConfigFile is not valid TOML; backing it up to $codexConfigFile.bak"
            run mv $VERBOSE_ARG "$codexConfigFile" "$codexConfigFile.bak"
            codexMerged=$(cat "$codexConfigNix")
          else
            errorEcho "codexMutableConfig failed to merge $codexConfigFile; leaving it untouched"
            exit 1
          fi
        else
          codexMerged=$(cat "$codexConfigNix")
        fi

        run codexWriteConfig "$codexConfigFile" <<< "$codexMerged"
        unset codexConfigFile codexConfigNix codexPython codexMergeConfig codexMerged
        unset -f codexWriteConfig
      ''
    );
  };
}
