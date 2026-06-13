{
  config,
  lib,
  ...
}:
let
  cfg = config.programs.ai.resources;

  sourceType = lib.types.oneOf [
    lib.types.package
    lib.types.path
    lib.types.str
  ];

  clientType = lib.types.submodule {
    options = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether to expose this resource to the client.";
      };

      source = lib.mkOption {
        type = lib.types.nullOr sourceType;
        default = null;
        description = "Client-specific source override for this resource.";
      };
    };
  };

  skillType = lib.types.submodule {
    options = {
      source = lib.mkOption {
        type = sourceType;
        description = "Default source path for this skill.";
      };

      clients = lib.mkOption {
        type = lib.types.submodule {
          options = {
            opencode = lib.mkOption {
              type = clientType;
              default = { };
              description = "OpenCode rendering settings for this skill.";
            };

            "claude-code" = lib.mkOption {
              type = clientType;
              default = { };
              description = "Claude Code rendering settings for this skill.";
            };
          };
        };
        default = { };
        description = "Per-client skill rendering settings.";
      };
    };
  };

  fileSpecType = lib.types.submodule {
    freeformType = lib.types.attrsOf lib.types.anything;

    options = {
      source = lib.mkOption {
        type = lib.types.nullOr sourceType;
        default = null;
        description = "Source path for the generated config file.";
      };

      text = lib.mkOption {
        type = lib.types.nullOr lib.types.lines;
        default = null;
        description = "Inline contents for the generated config file.";
      };
    };
  };

  opencodePluginType = lib.types.submodule {
    options = {
      entry = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Optional value to append to programs.opencode.settings.plugin.";
      };

      files = lib.mkOption {
        type = lib.types.attrsOf fileSpecType;
        default = { };
        description = "OpenCode config files to install for this plugin.";
      };
    };
  };

  sourceFor =
    clientName: skill:
    let
      client = skill.clients.${clientName};
    in
    if client.source != null then client.source else skill.source;

  enabledSkillsFor =
    clientName: lib.filterAttrs (_: skill: skill.clients.${clientName}.enable) cfg.skills;

  opencodeSkills = lib.mapAttrs' (
    name: skill:
    lib.nameValuePair "opencode/skills/${name}" {
      source = sourceFor "opencode" skill;
    }
  ) (enabledSkillsFor "opencode");

  claudeCodeSkills = lib.mapAttrs (_: sourceFor "claude-code") (enabledSkillsFor "claude-code");

  cleanFileSpec = lib.filterAttrs (_: value: value != null);

  opencodePluginFiles = lib.foldl' (
    files: plugin: files // lib.mapAttrs (_: cleanFileSpec) plugin.files
  ) { } cfg.opencodePlugins;

  opencodePluginEntries = builtins.filter (entry: entry != null) (
    map (plugin: plugin.entry) cfg.opencodePlugins
  );
in
{
  options.programs.ai.resources = {
    skills = lib.mkOption {
      type = lib.types.attrsOf skillType;
      default = { };
      description = "Shared AI skills rendered by supported clients.";
    };

    claudePlugins = lib.mkOption {
      type = lib.types.listOf sourceType;
      default = [ ];
      description = "Shared Claude Code plugin directories.";
    };

    opencodePlugins = lib.mkOption {
      type = lib.types.listOf opencodePluginType;
      default = [ ];
      description = "Shared OpenCode plugin entries and config files.";
    };
  };

  config = lib.mkMerge [
    (lib.mkIf config.programs.opencode.enable {
      xdg.configFile = opencodeSkills // opencodePluginFiles;
      programs.opencode.settings.plugin = opencodePluginEntries;
    })

    (lib.mkIf config.programs.claude-code.enable {
      programs.claude-code = {
        skills = claudeCodeSkills;
        plugins = cfg.claudePlugins;
      };
    })
  ];
}
