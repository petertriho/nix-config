{
  pkgs,
  config,
  lib,
  ...
}:
let
  cheapModel = "github-copilot/gpt-5-mini";
  defaultModel = "openai/gpt-5.4";

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
    crush
    gemini-cli
    openskills
    openspec
    qmd
    # qwen-code
    rtk
    tuicr
    workmux
  ];

  sharedLspConfig = {
    bashls = {
      command = "bash-language-server";
      args = [ "start" ];
      filetypes = [
        "sh"
        "bash"
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

  toOpencodeLsp =
    name: cfg:
    let
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
        nix = ".nix";
        terraform = ".tf";
        tf = ".tfvars";
      };
      extensions = map (ft: extensionMap.${ft} or ".${ft}") cfg.filetypes;
    in
    {
      command = [ cfg.command ] ++ cfg.args;
      inherit extensions;
    };
  opencodeLspConfig = lib.mapAttrs toOpencodeLsp sharedLspConfig // {
    typescript.disabled = true;
    pyright.disabled = true;
  };

  toCrushLsp = name: cfg: cfg;
  crushLspConfig = lib.mapAttrs toCrushLsp sharedLspConfig;

  toCrushMcp =
    _: server:
    lib.optionalAttrs (server ? type) { type = server.type; }
    // lib.optionalAttrs (server ? command) {
      command = server.command;
      args = server.args or [ ];
    }
    // lib.optionalAttrs (server ? url) {
      type = server.type or "http";
      url = server.url;
    }
    // lib.optionalAttrs (server ? env) { env = server.env; }
    // lib.optionalAttrs (server ? headers) { headers = server.headers; }
    // lib.optionalAttrs (server ? disabled) { disabled = server.disabled; }
    // lib.optionalAttrs (server ? disabled_tools) { disabled_tools = server.disabled_tools; }
    // lib.optionalAttrs (server ? timeout) { timeout = server.timeout; };
  crushMcpConfig = lib.mapAttrs toCrushMcp config.programs.mcp.servers;

  crushConfig = builtins.toJSON {
    "$schema" = "https://charm.land/crush.json";
    lsp = crushLspConfig;
    mcp = crushMcpConfig;
    tools = {
      ls = {
        max_depth = 0;
        max_items = 1000;
      };
    };
    options = {
      attribution = {
        trailer_style = "none";
        generated_with = false;
      };
      disable_metrics = true;
      disabled_tools = [ ];
    };
  };
in
{
  home = {
    packages =
      with pkgs;
      [
        # amazon-q-cli
        chunkhound
        ilmari
        models
        nodejs
        # pinchtab
        playwriter
        python3
        tmuxai
        tmuxcc
        uipro
        # tiktoken is provided by chunkhound
        # python3Packages.tiktoken
        # goose-cli
        # plandex
      ]
      ++ mcpServerPackages
      ++ llmAgents;
    file = {
      ".gemini/settings.json".source = config.lib.meta.mkDotfilesSymlink "gemini/.gemini/settings.json";
    };
    sessionVariables = {
      CHUNKHOUND_LLM_PROVIDER = "opencode-cli";
      CHUNKHOUND_LLM_UTILITY_MODEL = cheapModel;
      CHUNKHOUND_LLM_SYNTHESIS_MODEL = defaultModel;
      CHUNKHOUND_EMBEDDING__PROVIDER = "openai";
      # CHUNKHOUND_EMBEDDING__API_KEY = "";
      # CHUNKHOUND_EMBEDDING__BASE_URL = "https://openrouter.ai/api/v1";
      # CHUNKHOUND_EMBEDDING__MODEL = "qwen/qwen3-embedding-8b";
      CHUNKHOUND_EMBEDDING__BASE_URL = "https://chutes-qwen-qwen3-embedding-8b.chutes.ai/v1";
      CHUNKHOUND_EMBEDDING__MODEL = "Qwen/Qwen3-Embedding-8B";
      OPENSPEC_TELEMETRY = 0;
    };
  };
  programs = {
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
        chunkhound = {
          command = "chunkhound";
          args = [
            "mcp"
            "--stdio"
          ];
          disabled = false;
        };
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
        playwriter = {
          command = "playwriter";
          args = [ ];
          # command = "${pkgs.nodejs}/bin/npx";
          # args = [
          #   "playwriter@latest"
          # ];
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
        small_model = cheapModel;
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
    impeccable.enable = true;
    plannotator.enable = true;
    superpowers.enable = true;
  };
  xdg.configFile = {
    "crush/crush.json".text = crushConfig;
    # "opencode/skills/pinchtab".source = "${pkgs.pinchtab}/share/pinchtab/skills/pinchtab";
    "opencode/skills/playwriter".source = "${pkgs.playwriter}/share/playwriter/skills/playwriter";
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
  # // lib.mapAttrs' (
  #   name: _:
  #   lib.nameValuePair "opencode/agents/${name}" {
  #     source = "${pkgs.agency-agents}/share/agency-agents/integrations/opencode/agents/${name}";
  #   }
  # ) (builtins.readDir "${pkgs.agency-agents}/share/agency-agents/integrations/opencode/agents")
  // lib.mapAttrs' (
    name: _:
    lib.nameValuePair "opencode/skills/${name}" {
      source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/skills/${name}";
    }
  ) (builtins.readDir ../../dotfiles/opencode/.config/opencode/skills);
}
