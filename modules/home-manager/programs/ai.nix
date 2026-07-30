{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.ai;

  jsonFormat = pkgs.formats.json { };

  extensionMap = {
    sh = ".sh";
    bash = ".bash";
    javascript = ".js";
    javascriptreact = ".jsx";
    typescript = ".ts";
    typescriptreact = ".tsx";
    vue = ".vue";
    svelte = ".svelte";
    python = ".py";
    pyi = ".pyi";
    lua = ".lua";
    nix = ".nix";
    terraform = ".tf";
    tf = ".tfvars";
  };

  sourceType = lib.types.oneOf [
    lib.types.package
    lib.types.path
    lib.types.str
  ];

  sourceFor =
    clientName: skill:
    let
      client = skill.clients.${clientName};
    in
    if client.source != null then client.source else skill.source;

  enabledSkillsFor =
    clientName: lib.filterAttrs (_: skill: skill.clients.${clientName}.enable) cfg.skills;

  skillsFor = clientName: lib.mapAttrs (_: sourceFor clientName) (enabledSkillsFor clientName);

  skillFilesFor =
    clientName: targetDir:
    lib.mapAttrs' (name: source: lib.nameValuePair "${targetDir}/${name}" { inherit source; }) (
      skillsFor clientName
    );

  cleanFileSpec = lib.filterAttrs (_: value: value != null);

  filesFor =
    clientName:
    lib.foldl' (
      files: skill: files // lib.mapAttrs (_: cleanFileSpec) skill.clients.${clientName}.files
    ) { } (lib.attrValues cfg.skills);

  pluginEntriesFor =
    clientName:
    lib.concatLists (
      map (skill: skill.clients.${clientName}.pluginEntries) (lib.attrValues cfg.skills)
    );

  pluginPathsFor =
    clientName:
    lib.concatLists (map (skill: skill.clients.${clientName}.pluginPaths) (lib.attrValues cfg.skills));

  namedPluginPathsFor =
    clientName:
    lib.listToAttrs (
      lib.concatLists (
        lib.mapAttrsToList (
          skillName: skill:
          let
            pluginPaths = skill.clients.${clientName}.pluginPaths;
            hasMultiplePlugins = lib.length pluginPaths > 1;
          in
          lib.imap0 (
            index: pluginPath:
            lib.nameValuePair (
              if hasMultiplePlugins then "${skillName}-${toString (index + 1)}" else skillName
            ) pluginPath
          ) pluginPaths
        ) cfg.skills
      )
    );

  commandsFor =
    clientName:
    lib.foldl' (commands: skill: commands // skill.clients.${clientName}.commands) { } (
      lib.attrValues cfg.skills
    );

  enabledLspFor =
    clientName: lib.filterAttrs (_: server: server.clients.${clientName}.enable) cfg.lsp;

  toOpencodeLsp =
    _: server:
    let
      extensions = map (ft: extensionMap.${ft} or ".${ft}") server.filetypes;
    in
    {
      command = [ server.command ] ++ server.args;
      inherit extensions;
    }
    // server.clients.opencode.settings;

  toClaudeCodeLsp =
    _: server:
    {
      command = server.command;
      extensionToLanguage = lib.listToAttrs (
        map (ft: lib.nameValuePair (extensionMap.${ft} or ".${ft}") ft) server.filetypes
      );
    }
    // lib.optionalAttrs (server.args != [ ]) { args = server.args; }
    // server.clients."claude-code".settings;

  toPiLsp =
    _: server:
    {
      command = [ server.command ] ++ server.args;
      extensions = map (ft: extensionMap.${ft} or ".${ft}") server.filetypes;
    }
    // server.clients.pi.settings;

  cleanMcpServer =
    server:
    lib.filterAttrs (_: value: value != null && value != [ ] && value != { }) (
      removeAttrs server [ "clients" ]
    );

  fileSpecType = lib.types.submodule {
    freeformType = lib.types.attrsOf lib.types.anything;

    options = {
      source = lib.mkOption {
        type = lib.types.nullOr sourceType;
        default = null;
        description = "Source path for the generated client file.";
      };

      text = lib.mkOption {
        type = lib.types.nullOr lib.types.lines;
        default = null;
        description = "Inline contents for the generated client file.";
      };
    };
  };

  skillClientType = lib.types.submodule {
    options = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether to render this skill source for the client.";
      };

      source = lib.mkOption {
        type = lib.types.nullOr sourceType;
        default = null;
        description = "Client-specific source override for this skill.";
      };

      files = lib.mkOption {
        type = lib.types.attrsOf fileSpecType;
        default = { };
        description = "Client-specific files associated with this skill capability.";
      };

      pluginEntries = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Client-specific plugin entries associated with this skill capability.";
      };

      pluginPaths = lib.mkOption {
        type = lib.types.listOf sourceType;
        default = [ ];
        description = "Client-specific plugin paths associated with this skill capability.";
      };

      commands = lib.mkOption {
        type = lib.types.attrsOf (lib.types.either lib.types.lines lib.types.path);
        default = { };
        description = "Client-specific commands associated with this skill capability.";
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
              type = skillClientType;
              default = { };
              description = "OpenCode rendering settings for this skill.";
            };

            "claude-code" = lib.mkOption {
              type = skillClientType;
              default = { };
              description = "Claude Code rendering settings for this skill.";
            };

            codex = lib.mkOption {
              type = skillClientType;
              default = { };
              description = "Codex rendering settings for this skill.";
            };

            pi = lib.mkOption {
              type = skillClientType;
              default = { };
              description = "Pi rendering settings for this skill.";
            };
          };
        };
        default = { };
        description = "Per-client skill rendering settings.";
      };
    };
  };

  lspClientType = lib.types.submodule {
    options = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether to expose this LSP capability to the client.";
      };

      settings = lib.mkOption {
        type = lib.types.attrsOf lib.types.anything;
        default = { };
        description = "Client-specific LSP settings.";
      };
    };
  };

  lspType = lib.types.submodule {
    options = {
      command = lib.mkOption {
        type = lib.types.str;
        description = "The LSP server command to run.";
      };

      args = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Arguments to pass to the LSP server command.";
      };

      filetypes = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "File types this LSP server handles.";
      };

      clients = lib.mkOption {
        type = lib.types.submodule {
          options = {
            opencode = lib.mkOption {
              type = lspClientType;
              default = { };
              description = "OpenCode rendering settings for this LSP server.";
            };

            "claude-code" = lib.mkOption {
              type = lspClientType;
              default = { };
              description = "Claude Code rendering settings for this LSP server.";
            };

            crush = lib.mkOption {
              type = lspClientType;
              default = { };
              description = "Crush rendering settings for this LSP server.";
            };

            pi = lib.mkOption {
              type = lspClientType;
              default = { };
              description = "Pi rendering settings for this LSP server.";
            };
          };
        };
        default = { };
        description = "Per-client LSP rendering settings.";
      };
    };
  };

  mcpClientType = lib.types.submodule {
    options = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether to expose this MCP capability to the client.";
      };

      settings = lib.mkOption {
        type = lib.types.attrsOf lib.types.anything;
        default = { };
        description = "Client-specific MCP settings.";
      };
    };
  };

  mcpType = lib.types.submodule {
    freeformType = (pkgs.formats.json { }).type;

    options = {
      command = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Executable for a local MCP server.";
      };

      url = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "HTTP(S) endpoint for a remote MCP server.";
      };

      args = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Arguments passed to the MCP server command.";
      };

      env = lib.mkOption {
        type = lib.types.attrsOf lib.types.anything;
        default = { };
        description = "Environment variables set when spawning the MCP server.";
      };

      headers = lib.mkOption {
        type = lib.types.attrsOf lib.types.str;
        default = { };
        description = "HTTP headers for a remote MCP server.";
      };

      enabled = lib.mkOption {
        type = lib.types.nullOr lib.types.bool;
        default = null;
        description = "Whether this MCP server is enabled.";
      };

      clients = lib.mkOption {
        type = lib.types.submodule {
          options = {
            opencode = lib.mkOption {
              type = mcpClientType;
              default = { };
              description = "OpenCode rendering settings for this MCP server.";
            };

            "claude-code" = lib.mkOption {
              type = mcpClientType;
              default = { };
              description = "Claude Code rendering settings for this MCP server.";
            };

            codex = lib.mkOption {
              type = mcpClientType;
              default = { };
              description = "Codex rendering settings for this MCP server.";
            };

            crush = lib.mkOption {
              type = mcpClientType;
              default = { };
              description = "Crush rendering settings for this MCP server.";
            };
          };
        };
        default = { };
        description = "Per-client MCP rendering settings.";
      };
    };
  };
in
{
  options.programs.ai = {
    skills = lib.mkOption {
      type = lib.types.attrsOf skillType;
      default = { };
      description = "Shared AI skills rendered by supported clients.";
    };

    lsp = lib.mkOption {
      type = lib.types.attrsOf lspType;
      default = { };
      description = "Shared LSP server capabilities rendered by supported AI clients.";
    };

    mcp = lib.mkOption {
      type = lib.types.attrsOf mcpType;
      default = { };
      description = "Shared MCP server capabilities rendered by supported AI clients.";
    };
  };

  config = lib.mkMerge [
    (lib.mkIf config.programs.opencode.enable {
      xdg.configFile = filesFor "opencode" // skillFilesFor "opencode" "opencode/skills";
      programs.opencode = {
        commands = commandsFor "opencode";
        settings = {
          lsp = lib.mapAttrs toOpencodeLsp (enabledLspFor "opencode");
          plugin = pluginEntriesFor "opencode";
        };
      };
    })

    (lib.mkIf config.programs.claude-code.enable {
      home.file = skillFilesFor "claude-code" "${config.programs.claude-code.configDir}/skills";
      programs.claude-code = {
        commands = commandsFor "claude-code";
        lspServers = lib.mapAttrs toClaudeCodeLsp (enabledLspFor "claude-code");
        plugins = namedPluginPathsFor "claude-code";
      };
    })

    (lib.mkIf config.programs.codex.enable {
      xdg.configFile = filesFor "codex";
      programs.codex = {
        skills = skillsFor "codex";
        plugins = pluginPathsFor "codex";
      };
    })

    (lib.mkIf config.programs.pi-coding-agent.enable (
      let
        piConfigDir = config.programs.pi-coding-agent.configDir;
      in
      {
        home.file = skillFilesFor "pi" "${piConfigDir}/skills" // {
          "${piConfigDir}/pi-lsp.json".source = jsonFormat.generate "pi-lsp.json" (
            lib.mapAttrs toPiLsp (enabledLspFor "pi")
          );
        };
      }
    ))

    {
      programs.mcp.servers = lib.mapAttrs (_: cleanMcpServer) cfg.mcp;
    }
  ];
}
