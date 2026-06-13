{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.anthropic-skills;
  skillsDir = "${pkgs.anthropic-skills}/share/anthropic-skills/skills";
  availableSkills = builtins.attrNames (builtins.readDir skillsDir);
  selectedSkills = builtins.listToAttrs (
    map (name: lib.nameValuePair name "${skillsDir}/${name}") cfg.skills
  );
in
{
  options.programs.anthropic-skills = {
    enable = lib.mkEnableOption "Anthropic skills";
    skills = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableSkills);
      default = [ ];
      example = [ "skill-creator" ];
      description = "Anthropic skill directories to expose to supported LLM clients.";
    };
  };

  config = lib.mkIf cfg.enable {
    programs.ai.resources.skills = lib.mapAttrs (_: source: { inherit source; }) selectedSkills;
  };
}
