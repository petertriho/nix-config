{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.crush;

  enabledLspCapabilities = lib.filterAttrs (
    _: server: server.clients.crush.enable
  ) config.programs.ai.lsp;

  toCrushLsp = _: server: removeAttrs server [ "clients" ] // server.clients.crush.settings;
  crushLspConfig = lib.mapAttrs toCrushLsp enabledLspCapabilities;

  toCrushMcp =
    _: server:
    lib.optionalAttrs (server.type or null != null) { type = server.type; }
    // lib.optionalAttrs (server.command or null != null) {
      type = server.type or "stdio";
      command = server.command;
      args = server.args or [ ];
    }
    // lib.optionalAttrs (server.url or null != null) {
      type = server.type or "http";
      url = server.url;
    }
    // lib.optionalAttrs (server.env or { } != { }) { env = server.env; }
    // lib.optionalAttrs (server.headers or { } != { }) { headers = server.headers; }
    // lib.optionalAttrs (server.disabled or null != null) { disabled = server.disabled; }
    // lib.optionalAttrs (!(server ? disabled) && server.enabled != null) {
      disabled = !server.enabled;
    }
    // lib.optionalAttrs (server.disabled_tools or [ ] != [ ]) {
      disabled_tools = server.disabled_tools;
    }
    // lib.optionalAttrs (server.timeout or null != null) { timeout = server.timeout; }
    // server.clients.crush.settings;
  crushMcpConfig = lib.mapAttrs toCrushMcp (
    lib.filterAttrs (_: server: server.clients.crush.enable) config.programs.ai.mcp
  );

  crushConfig = builtins.toJSON {
    "$schema" = "https://charm.land/crush.json";
    providers = {
      openai = {
        base_url = "http://127.0.0.1:8317/v1";
        api_key = "$CLI_PROXY_API_KEY";
      };
    };
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
  config = lib.mkIf cfg.enable {
    home.packages = [ pkgs.llm-agents.crush ];
    xdg.configFile."crush/crush.json".text = crushConfig;
  };
}
