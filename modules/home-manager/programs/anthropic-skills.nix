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

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      (lib.mkIf config.programs.opencode.enable {
        xdg.configFile = lib.mapAttrs' (
          name: path:
          lib.nameValuePair "opencode/skills/${name}" {
            source = path;
          }
        ) selectedSkills;
      })
      (lib.mkIf config.programs.claude-code.enable {
        programs.claude-code.skills = selectedSkills;
      })
      (lib.mkIf config.programs.codex.enable {
        programs.codex.skills = selectedSkills;
      })
    ]
  );
}
