{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.crush;
  lspServers = config.programs.lsp.servers;

  toCrushLsp = name: cfg: cfg;
  crushLspConfig = lib.mapAttrs toCrushLsp lspServers;

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
  options.programs.crush = {
    enable = lib.mkEnableOption "crush AI coding agent";
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ pkgs.llm-agents.crush ];
    xdg.configFile."crush/crush.json".text = crushConfig;
  };
}
