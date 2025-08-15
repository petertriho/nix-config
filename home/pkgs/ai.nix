{
  pkgs,
  config,
  ...
}:
{
  home = {
    packages = with pkgs; [
      aider-chat
      ccusage
      claude-code
      context7-mcp
      gemini-cli
      nodejs
      # goose-cli
      # plandex
    ];
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
            # "${pkgs.nodejs}/bin/npx"
            # "-y"
            # "@upstash/context7-mcp"
            "context7-mcp"
          ];
          enabled = true;
        };
        github = {
          type = "local";
          command = [
            (pkgs.lib.getExe pkgs.github-mcp-server)
          ];
          environment = {
            GITHUB_PERSONAL_ACCESS_TOKEN = "{env:OPENCODE_GITHUB_PERSONAL_ACCESS_TOKEN}";
          };
          enabled = true;
        };
        grafana = {
          type = "local";
          command = [
            (pkgs.lib.getExe pkgs.mcp-grafana)
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
            (pkgs.lib.getExe pkgs.mcp-nixos)
          ];
          enabled = true;
        };
        playwright = {
          type = "local";
          command = [
            (pkgs.lib.getExe pkgs.playwright-mcp)
          ];
          enabled = false;
        };
        serena = {
          type = "local";
          command = [
            (pkgs.lib.getExe pkgs.serena)
            "--context"
            "ide-assistant"
            "--project"
            "."
          ];
          enabled = true;
        };
        terraform = {
          type = "local";
          command = [
            (pkgs.lib.getExe pkgs.terraform-mcp-server)
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
