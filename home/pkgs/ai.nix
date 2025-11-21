{
  pkgs,
  config,
  ...
}:
let
  mcpServers = with pkgs; [
    context7-mcp
    # mcp-grafana
    # mcp-nixos
    mcp-server-fetch
    mcp-server-sequential-thinking
    # playwright-mcp
    terraform-mcp-server
  ];
in
{
  home = {
    packages =
      with pkgs;
      [
        amazon-q-cli
        copilot-language-server
        # unstable.gemini-cli
        gemini-cli
        gh-copilot
        github-copilot-cli
        nodejs
        # unstable.qwen-code
        qwen-code
        python3Packages.tiktoken
        # goose-cli
        # plandex
      ]
      ++ mcpServers;
  };
  programs.opencode = {
    enable = true;
    package = pkgs.unstable.opencode;
    # package = pkgs.opencode;
    settings = {
      theme = "tokyonight";
      autoshare = false;
      autoupdate = false;
      # snapshot = false;
      lsp = {
        bashls = {
          command = [
            "bash-language-server"
            "start"
          ];
          extensions = [
            ".sh"
            ".bash"
          ];
        };
        eslint = {
          command = [
            "vscode-eslint-language-server"
            "--stdio"
          ];
          extensions = [
            ".js"
            ".jsx"
            ".ts"
            ".tsx"
            ".vue"
            ".svelte"
          ];
        };
        typescript = {
          disabled = true;
        };
        vtsls = {
          command = [
            "vtsls"
            "--stdio"
          ];
          extensions = [
            ".js"
            ".jsx"
            ".ts"
            ".tsx"
            ".mjs"
            ".cjs"
            ".mts"
            ".cts"
          ];
        };
        pyright = {
          disabled = true;
        };
        basedpyright = {
          command = [
            "basedpyright-langserver"
            "--stdio"
          ];
          extensions = [
            ".py"
            ".pyi"
          ];
        };
        lua_ls = {
          command = [ "lua-language-server" ];
          extensions = [ ".lua" ];
        };
        nil_ls = {
          command = [ "nil" ];
          extensions = [ ".nix" ];
        };
        terraformls = {
          command = [
            "terraform-ls"
            "serve"
          ];
          extensions = [
            ".tf"
            ".tfvars"
          ];
        };
      };
      small_model = "github-copilot/gpt-5-mini";
      mcp = {
        atlassian = {
          type = "local";
          command = [
            "${pkgs.nodejs}/bin/npx"
            "-y"
            "mcp-remote"
            "https://mcp.atlassian.com/v1/sse"
          ];
          enabled = false;
        };
        context7 = {
          type = "local";
          command = [
            "context7-mcp"
          ];
          enabled = true;
        };
        fetch = {
          type = "local";
          command = [
            "mcp-server-fetch"
          ];
          enabled = false;
        };
        grafana = {
          type = "local";
          command = [
            "mcp-grafana"
          ];
          environment = {
            GRAFANA_URL = "{env:OPENCODE_GRAFANA_URL}";
            GRAFANA_API_KEY = "{env:OPENCODE_GRAFANA_API_KEY}";
          };
          enabled = false;
        };
        nixos = {
          type = "local";
          command = [
            "mcp-nixos"
          ];
          enabled = false;
        };
        playwright = {
          type = "local";
          command = [
            "playwright-mcp"
          ];
          enabled = false;
        };
        sequential-thinking = {
          type = "local";
          command = [
            "mcp-server-sequential-thinking"
          ];
          enabled = true;
        };
        terraform = {
          type = "local";
          command = [
            "terraform-mcp-server"
          ];
          enabled = false;
        };
      };
    };
  };
  xdg.configFile = {
    "opencode/agent/".source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/agent/";
  };
}
