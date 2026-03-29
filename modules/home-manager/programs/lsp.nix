{
  config,
  lib,
  ...
}:
let
  serverType = lib.types.submodule {
    options = {
      command = lib.mkOption {
        type = lib.types.str;
        description = "The LSP server command to run";
      };
      args = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Arguments to pass to the LSP server command";
      };
      filetypes = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "File types this LSP server handles";
      };
    };
  };
in
{
  options.programs.lsp = {
    enable = lib.mkEnableOption "shared LSP server configuration";

    servers = lib.mkOption {
      type = lib.types.attrsOf serverType;
      default = { };
      description = "Shared LSP server configurations consumed by coding agents";
    };
  };
}
