{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.basic-memory;
  skillsDir = "${pkgs.basic-memory-skills}/share/basic-memory-skills";
  skillEntries = builtins.readDir skillsDir;
  availableSkills = builtins.attrNames (
    lib.filterAttrs (
      name: type:
      # Exclude upstream metadata directories that are not actual skills.
      type == "directory"
      && !(lib.elem name [
        ".agents"
        ".claude"
      ])
    ) skillEntries
  );
  selectedSkills = builtins.listToAttrs (
    map (name: lib.nameValuePair name "${skillsDir}/${name}") availableSkills
  );
in
{
  options.programs.basic-memory = {
    enable = lib.mkEnableOption "Basic Memory MCP and skills";
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ pkgs.basic-memory ];
    programs.mcp.servers.basic-memory = {
      command = "basic-memory-mcp";
      args = [ ];
      disabled = false;
    };
    programs.ai.resources.skills = lib.mapAttrs (_: source: { inherit source; }) selectedSkills;
  };
}
