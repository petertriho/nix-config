{
  pkgs,
  config,
  lib,
  ...
}:
let
  mcpServerPackages =
    (with pkgs.mcp-servers; [
      # context7-mcp
    ])
    ++ (with pkgs; [
      # terraform-mcp-server
    ]);
  llmAgents = with pkgs.llm-agents; [
    openspec
    workmux
  ];

  lspServers = config.programs.lsp.servers;

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

  toOpencodeLsp =
    name: cfg:
    let
      extensions = map (ft: extensionMap.${ft} or ".${ft}") cfg.filetypes;
    in
    {
      command = [ cfg.command ] ++ cfg.args;
      inherit extensions;
    };
  opencodeLspConfig = lib.mapAttrs toOpencodeLsp lspServers // {
    lua-ls.disabled = true;
    pyright.disabled = true;
    typescript.disabled = true;
  };

  toClaudeCodeLsp =
    name: cfg:
    {
      command = cfg.command;
      extensionToLanguage = lib.listToAttrs (
        map (ft: lib.nameValuePair (extensionMap.${ft} or ".${ft}") ft) cfg.filetypes
      );
    }
    // lib.optionalAttrs (cfg.args != [ ]) { args = cfg.args; };
  claudeCodeLspConfig = lib.mapAttrs toClaudeCodeLsp lspServers;
in
{
  home = {
    packages =
      with pkgs;
      [
        # amazon-q-cli
        nodejs
        # open-design
        python3
        react-doctor
        tmuxai
        tokscale
        uipro
        # tiktoken is provided by chunkhound
        # python3Packages.tiktoken
        # goose-cli
        # plandex
      ]
      ++ mcpServerPackages
      ++ llmAgents;
    file = {
      ".config/opencode/plugins/skills-sidebar.tsx".source =
        config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/plugins/skills-sidebar.tsx";
      ".codex/config.toml".source = config.lib.meta.mkDotfilesSymlink "codex/.codex/config.toml";
    };
    sessionVariables = {
      BASIC_MEMORY_NO_PROMOS = 1;
      BASIC_MEMORY_FORCE_LOCAL = "true";
      OPENSPEC_TELEMETRY = 0;
    };
  };
  programs = {
    lsp = {
      enable = true;
      servers = {
        bashls = {
          command = "bash-language-server";
          args = [ "start" ];
          filetypes = [
            "sh"
            "bash"
          ];
        };
        basedpyright = {
          command = "basedpyright-langserver";
          args = [
            "--stdio"
          ];
          filetypes = [
            "python"
            "pyi"
          ];
        };
        eslint = {
          command = "vscode-eslint-language-server";
          args = [ "--stdio" ];
          filetypes = [
            "javascript"
            "javascriptreact"
            "typescript"
            "typescriptreact"
            "vue"
            "svelte"
          ];
        };
        lua-lsp = {
          command = "lua-language-server";
          args = [ ];
          filetypes = [ "lua" ];
        };
        nil_ls = {
          command = "nil";
          args = [ ];
          filetypes = [ "nix" ];
        };
        # pyrefly = {
        #   command = "pyrefly";
        #   args = [ "lsp" ];
        #   filetypes = [
        #     "python"
        #     "pyi"
        #   ];
        # };
        terraformls = {
          command = "terraform-ls";
          args = [
            "serve"
          ];
          filetypes = [
            "terraform"
            "tf"
          ];
        };
        vtsls = {
          command = "vtsls";
          args = [ "--stdio" ];
          filetypes = [
            "javascript"
            "javascriptreact"
            "typescript"
            "typescriptreact"
          ];
        };
      };
    };
    mcp = {
      enable = true;
      servers = {
        # atlassian = {
        #   url = "https://mcp.atlassian.com/v1/sse";
        #   type = "sse";
        #   headers = {
        #     Authorization = "Bearer {env:ATLASSIAN_API_TOKEN}";
        #   };
        #   disabled = true;
        # };
        # ck = {
        #   command = "ck";
        #   args = [ "--serve" ];
        #   disabled = true;
        # };
        # terraform = {
        #   command = "terraform-mcp-server";
        #   args = [ ];
        #   disabled = true;
        # };
      };
    };
    claude-code = {
      enable = true;
      package = pkgs.llm-agents.claude-code;
      enableMcpIntegration = true;
      lspServers = claudeCodeLspConfig;
    };
    codex = {
      enable = true;
      package = pkgs.llm-agents.codex;
      enableMcpIntegration = false;
      # settings = {
      #   theme = "ansi";
      #   features = {
      #     multi_agent = true;
      #   };
      #   tui = {
      #     status_line = [
      #       "model-with-reasoning"
      #       "context-remaining"
      #       "current-dir"
      #       "five-hour-limit"
      #       "weekly-limit"
      #       "context-window-size"
      #       "used-tokens"
      #       "total-input-tokens"
      #       "total-output-tokens"
      #     ];
      #   };
      # };
    };
    opencode = {
      enable = true;
      # package = pkgs.unstable.opencode;
      package = pkgs.llm-agents.opencode;
      enableMcpIntegration = true;
      settings = {
        autoshare = false;
        autoupdate = false;
        # snapshot = false;
        lsp = opencodeLspConfig;
        small_model = "opencode-go/deepseek-v4-flash";
        plugin = [
          # "@bastiangx/opencode-unmoji"
          "@franlol/opencode-md-table-formatter"
          # "@mohak34/opencode-notifier"
          # "@slkiser/opencode-quota"
          # "@tarquinen/opencode-dcp"
        ];
        agent = {
          plan = {
            model = "{env:OPENCODE_AGENT_PLAN_MODEL}";
            permission = {
              edit = {
                "*" = "deny";
                ".artifacts/**" = "allow";
              };
            };
          };
          build = {
            model = "{env:OPENCODE_AGENT_BUILD_MODEL}";
            permission = {
              external_directory = {
                "/nix/store/**" = "allow";
              };
              read = {
                "/nix/store/**" = "allow";
              };
              glob = {
                "/nix/store/**" = "allow";
              };
            };
          };
        };
        experimental = {
          quotaToast = {
            enableToast = false;
            formatStyle = "grouped";
            onlyCurrentModel = true;
          };
        };
      };
      tui = {
        theme = "tokyonight";
        plugin = [
          "./plugins/skills-sidebar.tsx"
          "@ishaksebsib/opencode-tree"
          # "@slkiser/opencode-quota"
          "oc-tps"
        ];
      };
    };
    agents.skills.enable = true;
    annot.enable = false;
    anthropic-skills = {
      enable = true;
      skills = [
        "skill-creator"
      ];
    };
    basic-memory.enable = false;
    chunkhound.enable = false;
    context-mode.enable = false;
    crush.enable = false;
    impeccable.enable = true;
    plannotator.enable = false;
    playwriter.enable = false;
    superpowers.enable = false;
    taste-skill = {
      enable = true;
      skills = [
        "taste-skill"
        "gpt-tasteskill"
        "image-to-code-skill"
        "redesign-skill"
        "soft-skill"
        "output-skill"
        "minimalist-skill"
        "brutalist-skill"
        "stitch-skill"
        "imagegen-frontend-web"
        "imagegen-frontend-mobile"
        "brandkit"
      ];
    };
  };
  xdg.configFile = {
    "tmuxai/config.yaml".source = config.lib.meta.mkDotfilesSymlink "tmuxai/.config/tmuxai/config.yaml";
    "workmux/config.yaml".source =
      config.lib.meta.mkDotfilesSymlink "workmux/.config/workmux/config.yaml";
  };
  # // lib.mapAttrs' (
  #   name: _:
  #   lib.nameValuePair "opencode/agents/${name}" {
  #     source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/agents/${name}";
  #   }
  # ) (builtins.readDir ../../dotfiles/opencode/.config/opencode/agents)
  # // lib.mapAttrs' (
  #   name: _:
  #   lib.nameValuePair "opencode/skills/${name}" {
  #     source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/skills/${name}";
  #   }
  # ) (builtins.readDir ../../dotfiles/opencode/.config/opencode/skills);
}
