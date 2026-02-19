{
  pkgs,
  config,
  lib,
  ...
}:
let
  cheapModel = "github-copilot/gpt-5-mini";

  mcpServers =
    (with pkgs.mcp-servers; [
      context7-mcp
      mcp-server-fetch
      mcp-server-sequential-thinking
    ])
    ++ (with pkgs; [
      # mcp-nixos
      terraform-mcp-server
      # mcp-grafana
      # playwright-mcp
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
    tuicr
    vibe-kanban
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

  sharedMcpConfig = {
    atlassian = {
      type = "stdio";
      command = "${pkgs.nodejs}/bin/npx";
      args = [
        "-y"
        "mcp-remote"
        "https://mcp.atlassian.com/v1/sse"
      ];
      disabled = true;
    };
    # ck = {
    #   type = "stdio";
    #   command = "ck";
    #   args = [ "--serve" ];
    #   disabled = true;
    # };
    context7 = {
      type = "stdio";
      command = "context7-mcp";
      args = [ ];
      disabled = false;
    };
    chunkhound = {
      type = "stdio";
      command = "chunkhound";
      args = [
        "mcp"
        "--stdio"
      ];
      disabled = false;
    };
    # fetch = {
    #   type = "stdio";
    #   command = "mcp-server-fetch";
    #   args = [ ];
    #   disabled = true;
    # };
    # grafana = {
    #   type = "stdio";
    #   command = "mcp-grafana";
    #   args = [ ];
    #   env = {
    #     GRAFANA_URL = "{env:OPENCODE_GRAFANA_URL}";
    #     GRAFANA_API_KEY = "{env:OPENCODE_GRAFANA_API_KEY}";
    #   };
    #   disabled = true;
    # };
    # nixos = {
    #   type = "stdio";
    #   command = "mcp-nixos";
    #   args = [ ];
    #   disabled = true;
    # };
    # playwright = {
    #   type = "stdio";
    #   command = "playwright-mcp";
    #   args = [ ];
    #   disabled = true;
    # };
    playwriter = {
      type = "stdio";
      command = "${pkgs.nodejs}/bin/npx";
      args = [
        "playwriter@latest"
      ];
      disabled = false;
    };
    # sequential-thinking = {
    #   type = "stdio";
    #   command = "mcp-server-sequential-thinking";
    #   args = [ ];
    #   disabled = true;
    # };
    # terraform = {
    #   type = "stdio";
    #   command = "terraform-mcp-server";
    #   args = [ ];
    #   disabled = true;
    # };
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

  toOpencodeMcp =
    name: cfg:
    let
      baseConfig = {
        type = "local";
        command = [ cfg.command ] ++ cfg.args;
        enabled = !cfg.disabled;
      };
    in
    if cfg ? env then baseConfig // { environment = cfg.env; } else baseConfig;
  opencodeMcpConfig = lib.mapAttrs toOpencodeMcp sharedMcpConfig;

  toCrushLsp = name: cfg: cfg;
  crushLspConfig = lib.mapAttrs toCrushLsp sharedLspConfig;

  toCrushMcp = name: cfg: cfg;
  crushMcpConfig = lib.mapAttrs toCrushMcp sharedMcpConfig;

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
        beads-ui
        chunkhound
        nodejs
        ralph-tui
        # tiktoken is provided by chunkhound
        # python3Packages.tiktoken
        # goose-cli
        # plandex
      ]
      ++ mcpServers
      ++ llmAgents;
    file.".gemini/settings.json".source =
      config.lib.meta.mkDotfilesSymlink "gemini/.gemini/settings.json";
    sessionVariables = {
      CHUNKHOUND_LLM_PROVIDER = "opencode-cli";
      CHUNKHOUND_LLM_UTILITY_MODEL = cheapModel;
      CHUNKHOUND_LLM_SYNTHESIS_MODEL = "zai-coding-plan/glm-4.7";
      CHUNKHOUND_EMBEDDING__PROVIDER = "openai";
      # CHUNKHOUND_EMBEDDING__API_KEY = "";
      CHUNKHOUND_EMBEDDING__BASE_URL = "https://openrouter.ai/api/v1";
      CHUNKHOUND_EMBEDDING__MODEL = "qwen/qwen3-embedding-8b";
    };
  };
  programs.opencode = {
    enable = true;
    # package = pkgs.unstable.opencode;
    package = pkgs.llm-agents.opencode;
    settings = {
      theme = "tokyonight";
      autoshare = false;
      autoupdate = false;
      # snapshot = false;
      lsp = opencodeLspConfig;
      small_model = cheapModel;
      mcp = opencodeMcpConfig;
      plugin = [
        "@franlol/opencode-md-table-formatter"
        "@mohak34/opencode-notifier"
        "@plannotator/opencode"
        "@tarquinen/opencode-dcp"
        "opencode-mystatus"
      ];
      command = {
        mystatus = {
          description = "Query quota usage for all AI accounts";
          template = "Use the mystatus tool to query quota usage. Return the result as-is without modification.";
          model = cheapModel;
        };
      };
      agent = {
        plan = {
          model = "{env:OPENCODE_AGENT_PLAN_MODEL}";
        };
        build = {
          model = "{env:OPENCODE_AGENT_BUILD_MODEL}";
        };
      };
    };
  };
  xdg.configFile = {
    "crush/crush.json".text = crushConfig;
    "opencode/agents/".source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/agents/";
    "opencode/commands/plannotator-annotate.md".source =
      config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/commands/plannotator-annotate.md";
    "opencode/commands/plannotator-review.md".source =
      config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/commands/plannotator-review.md";
    "workmux/config.yaml".source =
      config.lib.meta.mkDotfilesSymlink "workmux/.config/workmux/config.yaml";
  };
  programs.fish.shellAbbrs = {
    ocr = "opencode run --model ${cheapModel}";
    mystatus = "opencode run --model ${cheapModel} /mystatus";
  };
}
