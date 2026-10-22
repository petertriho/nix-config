{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.rea;
  skillsDir = "${cfg.package}/share/rea/skills";
  availableSkills = lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir);
in
{
  options.programs.rea = {
    enable = lib.mkEnableOption "REA reverse-engineering CLI, MCP server, and skills";
    package = lib.mkPackageOption pkgs "rea" { };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    programs = {
      opencode.settings.mcp.rea = {
        type = "local";
        command = [
          (lib.getExe' cfg.package "rea")
          "mcp"
        ];
        enabled = true;
      };

      pi-coding-agent.mcpServers.rea = {
        command = lib.getExe' cfg.package "rea";
        args = [ "mcp" ];
      };

      ai.skills = lib.mapAttrs (name: _: {
        source = "${skillsDir}/${name}";
        clients = {
          opencode.enable = true;
          claude-code.enable = false;
          codex.enable = false;
          pi.enable = true;
        };
      }) availableSkills;
    };
  };
}
