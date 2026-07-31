{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.effective-html;
  skillsDir = "${pkgs.effective-html}/share/effective-html/skills";
  availableSkills = builtins.attrNames (
    lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir)
  );
  selectedSkills = builtins.listToAttrs (
    map (name: lib.nameValuePair name "${skillsDir}/${name}") cfg.skills
  );
in
{
  options.programs.effective-html = {
    enable = lib.mkEnableOption "Effective HTML skills";

    skills = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableSkills);
      default = availableSkills;
      example = [
        "html"
        "html-wireframe"
      ];
      description = "Effective HTML upstream skill folder names to expose to supported LLM clients.";
    };
  };

  config = lib.mkIf cfg.enable {
    programs.ai.skills = lib.mapAttrs (_: source: { inherit source; }) selectedSkills;
  };
}
