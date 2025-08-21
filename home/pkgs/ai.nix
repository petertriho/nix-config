{
  pkgs,
  config,
  ...
}:
let
  mcpServers = with pkgs; [
    context7-mcp
    github-mcp-server
    mcp-grafana
    mcp-nixos
    mcp-server-fetch
    mcp-server-sequential-thinking
    playwright-mcp
    postgres-mcp
    serena
    terraform-mcp-server
  ];
in
{
  home = {
    packages =
      with pkgs;
      [
        aider-chat
        ccusage
        claude-code
        gemini-cli
        mighty-security
        nodejs
        # goose-cli
        # plandex
      ]
      ++ mcpServers;
    sessionVariables = {
      INSTALLED_MCP_SERVER_DIRS = pkgs.lib.concatStringsSep ":" (map (pkg: "${pkg}/bin") mcpServers);
    };
    file = {
      ".aider.conf.yml".source = config.lib.meta.mkDotfilesSymlink "aider/.aider.conf.yml";
      ".aider.model.settings.yml".source =
        config.lib.meta.mkDotfilesSymlink "aider/.aider.model.settings.yml";
    };
  };
  programs.opencode = {
    enable = true;
    package = pkgs.opencode;
    settings = {
      theme = "system";
      autoshare = false;
      autoupdate = false;
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
      small_model = "github-copilot/gpt-4.1";
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
        github = {
          type = "local";
          command = [
            "github-mcp-server"
          ];
          environment = {
            GITHUB_PERSONAL_ACCESS_TOKEN = "{env:OPENCODE_GITHUB_PERSONAL_ACCESS_TOKEN}";
          };
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
          enabled = true;
        };
        postgres = {
          type = "local";
          command = [
            "postgres-mcp"
            "--access-mode=restricted"
          ];
          environment = {
            DATABASE_URI = "{env:OPENCODE_DATABASE_URI}";
          };
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
        serena = {
          type = "local";
          command = [
            "serena"
            "start-mcp-server"
            "--context"
            "ide-assistant"
          ];
          enabled = false;
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
