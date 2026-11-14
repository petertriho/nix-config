{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.paseo;
  jsonFormat = pkgs.formats.json { };
  # The package output has no skills, so read them from the source of the same version.
  skillsDir = "${cfg.package.src}/skills";
  availableSkills = builtins.attrNames (
    lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir)
  );
  selectedSkills = builtins.listToAttrs (
    map (name: lib.nameValuePair name "${skillsDir}/${name}") cfg.skills
  );

  configPath = "${config.home.homeDirectory}/.paseo/config.json";
  settingsFile = jsonFormat.generate "paseo-config.json" cfg.settings;

  # Paseo 0.15.4 writes these defaults to a new home. Keep `daemon.relay.enabled = false`: when
  # config.json exists without the key, the daemon enables the relay.
  paseoDefaults = {
    version = 1;
    daemon = {
      listen = "127.0.0.1:6767";
      cors.allowedOrigins = [ "https://app.paseo.sh" ];
      relay.enabled = false;
    };
    app.baseUrl = "https://app.paseo.sh";
  };
  defaultsFile = jsonFormat.generate "paseo-default-config.json" paseoDefaults;

  # The upstream Claude Code merge. The check and the merger share it, so the check validates
  # the same result that the merger writes.
  jqOperation = ''if ($dynamic | type) == "object" and ($static | type) == "object" then $dynamic * $static else error("expected JSON objects") end'';
  mergeFilter = ''
    if ($dynamic | length) != 1 or ($static | length) != 1 then
      error("expected exactly one JSON value")
    else
      $dynamic[0] as $dynamic | $static[0] as $static | (
        ${jqOperation}
      )
    end
  '';

  # Paseo rejects a file with any unknown key, and the daemon then cannot load it. Validate the
  # merge result in a temporary Paseo home before the merger writes the real file, so an invalid
  # result fails the switch and leaves config.json unchanged.
  checkMergedConfig = ''
    (
      paseoCheckHome=
      # Activation owns the outer EXIT trap; cleanup must stay in this subshell.
      trap '[[ -z "$paseoCheckHome" ]] || rm -rf -- "$paseoCheckHome"' EXIT
      paseoCheckHome="$(${lib.getExe' pkgs.coreutils "mktemp"} -d)"

      paseoCheckInput=${lib.escapeShellArg configPath}
      if [[ ! -s "$paseoCheckInput" ]]; then
        paseoCheckInput=${defaultsFile}
      fi

      if ! ${lib.getExe pkgs.jaq} -n ${lib.escapeShellArg mergeFilter} \
        --slurpfile dynamic "$paseoCheckInput" \
        --slurpfile static ${settingsFile} \
        > "$paseoCheckHome/config.json"; then
        errorEcho ${lib.escapeShellArg "Paseo: could not merge programs.paseo.settings into ${configPath}. Check that the file holds one JSON object. Leaving it unchanged."}
        exit 1
      fi

      if ! paseoCheckErrors="$(${lib.getExe cfg.package} daemon config get --home "$paseoCheckHome" 2>&1 > /dev/null)"; then
        errorEcho ${lib.escapeShellArg "Paseo: programs.paseo.settings would make ${configPath} invalid; leaving it unchanged."}
        paseoCheckErrors="''${paseoCheckErrors//"$paseoCheckHome/config.json"/the merged config}"
        # The CLI prints the error twice, the second time with a Node.js stack trace. Keep
        # one copy of Paseo's list of invalid keys.
        ${lib.getExe pkgs.gawk} '!/^    at / && !seen[$0]++' <<< "$paseoCheckErrors" >&2 || true
        exit 1
      fi
    )
  '';
in
{
  options.programs.paseo = {
    enable = lib.mkEnableOption "Paseo daemon, CLI, web UI, and agent skills";

    package = lib.mkPackageOption pkgs "paseo" { };

    skills = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableSkills);
      default = availableSkills;
      defaultText = lib.literalMD "all skill directories in the package source";
      example = [
        "paseo"
        "paseo-handoff"
      ];
      description = "Paseo upstream skill folder names to expose to supported LLM clients.";
    };

    settings = lib.mkOption {
      inherit (jsonFormat) type;
      default = { };
      example = lib.literalExpression ''
        {
          features.webUi.enabled = true;
        }
      '';
      description = ''
        Settings that activation merges into the writable
        {file}`~/.paseo/config.json`. Declared values win, and arrays replace
        existing arrays. Undeclared keys stay, so Paseo can still write relay,
        pairing, and app settings. Removing a declaration does not remove the
        key from the file. Activation fails, and leaves the file unchanged, if
        the result is not a valid Paseo config. Do not declare per-host, secret,
        or voice keys.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
    programs.ai.skills = lib.mapAttrs (_: source: { inherit source; }) selectedSkills;

    # Paseo stores its font settings in each browser's local storage, not in config.json. Paste
    # these into Settings > Appearance. A value replaces Paseo's default stack, so each one ends
    # with that stack as the fallback. The code font also sets the terminal and the diff view.
    #
    # Interface font:
    # 'JetBrainsMono Nerd Font', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif
    #
    # Code font:
    # 'JetBrainsMono Nerd Font Mono', SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace

    # `empty` holds the Paseo new-home defaults, so a new config.json keeps the relay off.
    # Activation does not reload, start, stop, or restart the daemon. Run `paseo daemon reload`
    # after a switch that changes settings.
    home.activation.paseoMutableSettings = lib.mkIf (cfg.settings != { }) (
      lib.hm.dag.entryAfter [ "linkGeneration" ] ''
        ${checkMergedConfig}
        ${lib.hm.generators.mkImpureConfigMerger {
          inherit pkgs jqOperation;
          path = configPath;
          staticSettings = settingsFile;
          format = "json";
          empty = builtins.toJSON paseoDefaults;
          mode = "600";
        }}
      ''
    );
  };
}
