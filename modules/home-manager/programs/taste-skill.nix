{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.taste-skill;
  skillsDir = "${pkgs.taste-skill}/share/taste-skill/skills";
  availableSkills = builtins.attrNames (
    lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir)
  );
  selectedSkills = builtins.listToAttrs (
    map (name: lib.nameValuePair name "${skillsDir}/${name}") cfg.skills
  );
in
{
  options.programs.taste-skill = {
    enable = lib.mkEnableOption "Taste Skill design skills";

    skills = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableSkills);
      default = [ "taste-skill" ];
      example = [
        "taste-skill"
        "image-to-code-skill"
        "brandkit"
      ];
      description = "Taste Skill upstream skill folder names to expose to supported LLM clients.";
    };
  };

  config = lib.mkIf cfg.enable {
    programs.ai.resources.skills = lib.mapAttrs (_: source: { inherit source; }) selectedSkills;
  };
}
