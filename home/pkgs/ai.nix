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
      excalidraw-mcp
      # terraform-mcp-server
    ]);
  llmAgents = with pkgs.llm-agents; [
    agent-browser
    # backlog-md
    beads
    ck
    # coding-agent-search
    copilot-cli
    copilot-language-server

    gemini-cli
    openspec
    qmd
    # qwen-code
    rtk
    tuicr
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
        ilmari
        models
        nodejs
        # pinchtab

        python3
        tmuxai
        uipro
        # tiktoken is provided by chunkhound
        # python3Packages.tiktoken
        # goose-cli
        # plandex
      ]
      ++ mcpServerPackages
      ++ llmAgents;
    file = {
      ".claude/settings.json".source = config.lib.meta.mkDotfilesSymlink "claude/.claude/settings.json";
      ".gemini/settings.json".source = config.lib.meta.mkDotfilesSymlink "gemini/.gemini/settings.json";
    };
    sessionVariables = {
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
        lua-lsp = {
          command = "lua-language-server";
          args = [ ];
          filetypes = [ "lua" ];
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
        nil_ls = {
          command = "nil";
          args = [ ];
          filetypes = [ "nix" ];
        };
        pyrefly = {
          command = "pyrefly";
          args = [ "lsp" ];
          filetypes = [
            "python"
            "pyi"
          ];
        };
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
        # context7 = {
        #   command = "context7-mcp";
        #   args = [ ];
        #   disabled = false;
        # };
        # drawio = {
        #   command = "npx";
        #   args = [ "@next-ai-drawio/mcp-server@latest" ];
        #   disabled = false;
        # };
        excalidraw = {
          command = "excalidraw-mcp";
          args = [ "--stdio" ];
          disabled = false;
        };
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
      enableMcpIntegration = true;
    };
    opencode = {
      enable = true;
      # package = pkgs.unstable.opencode;
      package = pkgs.llm-agents.opencode;
      enableMcpIntegration = true;
      settings = {
        theme = "tokyonight";
        autoshare = false;
        autoupdate = false;
        # snapshot = false;
        lsp = opencodeLspConfig;
        small_model = "github-copilot/gpt-5-mini";
        plugin = [
          "@bastiangx/opencode-unmoji"
          "@franlol/opencode-md-table-formatter"
          # "@mohak34/opencode-notifier"
          "@slkiser/opencode-quota"
          # "@tarquinen/opencode-dcp"
          # "openrtk"
        ];
        agent = {
          plan = {
            model = "{env:OPENCODE_AGENT_PLAN_MODEL}";
            permission = {
              edit = {
                "*" = "deny";
                "docs/superpowers/*" = "allow";
              };
            };
          };
          build = {
            model = "{env:OPENCODE_AGENT_BUILD_MODEL}";
          };
        };
        provider = {
          acp = {
            npm = "@ai-sdk/openai-compatible";
            name = "ACP Agents";
            models = {
              "cursor/auto" = {
                name = "Cursor Auto";
              };
              "goose/default" = {
                name = "Goose Default";
              };
              "gemini/pro" = {
                name = "Gemini Pro";
              };
              "gemini/flash" = {
                name = "Gemini Flash";
              };
              "claude/opus" = {
                name = "Claude Opus";
              };
              "claude/sonnet" = {
                name = "Claude Sonnet";
              };
            };
          };
        };
      };
    };
    chunkhound.enable = true;
    crush.enable = true;
    impeccable.enable = true;
    plannotator.enable = true;
    playwriter.enable = true;
    superpowers.enable = true;
  };
  xdg.configFile = {
    # "opencode/skills/pinchtab".source = "${pkgs.pinchtab}/share/pinchtab/skills/pinchtab";
    "tmuxai/config.yaml".source = config.lib.meta.mkDotfilesSymlink "tmuxai/.config/tmuxai/config.yaml";
    "workmux/config.yaml".source =
      config.lib.meta.mkDotfilesSymlink "workmux/.config/workmux/config.yaml";
  }
  // lib.mapAttrs' (
    name: _:
    lib.nameValuePair "opencode/agents/${name}" {
      source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/agents/${name}";
    }
  ) (builtins.readDir ../../dotfiles/opencode/.config/opencode/agents)
  // lib.mapAttrs' (
    name: _:
    lib.nameValuePair "opencode/skills/${name}" {
      source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/skills/${name}";
    }
  ) (builtins.readDir ../../dotfiles/opencode/.config/opencode/skills);
}
