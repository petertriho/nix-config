{
  pkgs,
  config,
  lib,
  ...
}:
let
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
    # backlog-md
    beads
    ccusage-opencode
    coding-agent-search
    copilot-cli
    copilot-language-server
    crush
    gemini-cli
    openskills
    openspec
    # qwen-code
    spec-kit
    tuicr
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
    basedpyright = {
      command = "basedpyright-langserver";
      args = [ "--stdio" ];
      filetypes = [
        "python"
        "pyi"
      ];
    };
    nil_ls = {
      command = "nil";
      args = [ ];
      filetypes = [ "nix" ];
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
    context7 = {
      type = "stdio";
      command = "context7-mcp";
      args = [ ];
      disabled = false;
    };
    fetch = {
      type = "stdio";
      command = "mcp-server-fetch";
      args = [ ];
      disabled = true;
    };
    grafana = {
      type = "stdio";
      command = "mcp-grafana";
      args = [ ];
      env = {
        GRAFANA_URL = "{env:OPENCODE_GRAFANA_URL}";
        GRAFANA_API_KEY = "{env:OPENCODE_GRAFANA_API_KEY}";
      };
      disabled = true;
    };
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
    sequential-thinking = {
      type = "stdio";
      command = "mcp-server-sequential-thinking";
      args = [ ];
      disabled = false;
    };
    terraform = {
      type = "stdio";
      command = "terraform-mcp-server";
      args = [ ];
      disabled = true;
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
        # gemini-cli
        gh-copilot
        nodejs
        # qwen-code
        ralph-tui
        python3Packages.tiktoken
        # goose-cli
        # plandex
      ]
      ++ mcpServers
      ++ llmAgents;
    file.".gemini/settings.json".source =
      config.lib.meta.mkDotfilesSymlink "gemini/.gemini/settings.json";
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
      small_model = "github-copilot/gpt-5-mini";
      mcp = opencodeMcpConfig;
      plugin = [
        "@franlol/opencode-md-table-formatter"
        "@tarquinen/opencode-dcp"
        "opencode-antigravity-auth"
      ];
      provider = builtins.fromJSON (builtins.readFile ../../dotfiles/opencode/provider.json);
    };
  };
  xdg.configFile = {
    "opencode/agent/".source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/agent/";
    "crush/crush.json".text = crushConfig;
  };
}
