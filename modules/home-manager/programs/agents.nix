{
  config,
  lib,
  ...
}:

let
  cfg = config.programs.agents;
  skillsDir = ../../../dotfiles/agents/.agents/skills;
  skillEntries = builtins.readDir skillsDir;
  availableSkills = lib.filterAttrs (_: type: type == "directory") skillEntries;
in
{
  options.programs.agents = {
    skills.enable = lib.mkEnableOption "agents skills";
  };

  config = lib.mkIf cfg.skills.enable {
    home.file =
      lib.mapAttrs' (
        name: _:
        lib.nameValuePair ".agents/skills/${name}" {
          source = config.lib.meta.mkDotfilesSymlink "agents/.agents/skills/${name}";
        }
      ) availableSkills
      // lib.mapAttrs' (
        name: _:
        lib.nameValuePair ".claude/skills/${name}" {
          source = config.lib.meta.mkDotfilesSymlink "agents/.agents/skills/${name}";
        }
      ) availableSkills;
  };
}
