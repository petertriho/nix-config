{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.terraform-skill;
in
{
  options.programs.terraform-skill = {
    enable = lib.mkEnableOption "Terraform and OpenTofu skill";

    mcp.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to enable the Terraform MCP server with the public registry toolset.";
    };
  };

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        programs.ai.skills.terraform-skill.source =
          "${pkgs.terraform-skill}/share/terraform-skill/skills/terraform-skill";
      }

      (lib.mkIf cfg.mcp.enable {
        programs.ai.mcp.terraform = {
          command = lib.getExe pkgs.terraform-mcp-server;
          # The registry toolset is read-only and needs no TFE_TOKEN. The
          # upstream default, `all`, adds HCP Terraform tools that can change
          # workspaces.
          args = [
            "stdio"
            "--toolsets=registry"
          ];
        };
      })
    ]
  );
}
