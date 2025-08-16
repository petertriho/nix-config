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
    playwright-mcp
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
        serena
        # goose-cli
        # plandex
      ]
      ++ mcpServers
      ++ [
        (pkgs.writeShellScriptBin "check-all-mcps" ''
          #!/usr/bin/env bash

          echo "🔍 Checking all MCP configurations and installed MCPs with mighty-security..."
          echo "=================================================="

          # Get the current user's home directory
          HOME_DIR="$HOME"
          CONFIG_DIR="$HOME/.config/opencode"

          # Check if opencode config exists
          if [ ! -d "$CONFIG_DIR" ]; then
            echo "❌ OpenCode configuration directory not found at $CONFIG_DIR"
            echo "💡 Make sure you have opencode configured first"
            exit 1
          fi

          echo "📂 Scanning OpenCode MCP configuration..."

          # Run mighty-mcp check with comprehensive options
          mighty-mcp check \
            --client opencode \
            --deep \
            --format markdown \
            --output "/tmp/mcp-security-report.md"

          if [ $? -eq 0 ]; then
            echo "✅ MCP configuration check completed successfully!"
            echo "📄 Report saved to: /tmp/mcp-security-report.md"
          else
            echo "❌ MCP configuration check failed"
            exit 1
          fi

          # Scan MCP installation directories
          echo ""
          echo "🔍 Scanning MCP installation directories..."

          # Common MCP installation paths
          MCP_DIRS=(
            "$HOME/.local/share/mcp"
            "$HOME/.mcp"
            "/usr/local/lib/node_modules"
            "$HOME/.npm-global/lib/node_modules"
            "$HOME/node_modules"
          )

          # Add Nix store paths for the MCPs we have installed (full packages)
          MCP_DIRS+=(
            ${pkgs.lib.concatMapStringsSep "\n          " (pkg: ''"${pkg}"'') mcpServers}
          )

          FOUND_DIRS=0
          for MCP_DIR in "''${MCP_DIRS[@]}"; do
            if [ -d "$MCP_DIR" ]; then
              echo "📁 Checking directory: $MCP_DIR"
              ${pkgs.mighty-security}/bin/mighty-mcp check "$MCP_DIR" \
                --profile production \
                --format text \
                --output "/tmp/mcp-directory-scan-$(basename "$MCP_DIR").txt"

              if [ $? -eq 0 ]; then
                echo "  ✅ Directory scan completed"
                FOUND_DIRS=$((FOUND_DIRS + 1))
              else
                echo "  ⚠️ Directory scan had issues"
              fi
            fi
          done

          echo ""
          echo "📊 Summary:"
          echo "  • Configuration files: Scanned"
          echo "  • Installation directories: $FOUND_DIRS found and scanned"
          echo "  • Reports saved to: /tmp/mcp-*.txt and /tmp/mcp-security-report.md"

          # Also run a quick realtime scan for immediate feedback
          echo ""
          echo "🔄 Running quick scan for immediate feedback..."
          ${pkgs.mighty-security}/bin/mighty-mcp check --quick --client opencode

          echo ""
          echo "🎯 To start realtime monitoring, run:"
          echo "   mighty-mcp check --realtime --client opencode"
          echo ""
          echo "📚 For more options, see: https://github.com/NineSunsInc/mighty-security"
        '')
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
            "context7-mcp"
          ];
          enabled = true;
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
        playwright = {
          type = "local";
          command = [
            "playwright-mcp"
          ];
          enabled = false;
        };
        serena = {
          type = "local";
          command = [
            "serena"
            "start-mcp-server"
            "--context"
            "ide-assistant"
            "--project"
            "."
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
