{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.modern-web-guidance;
  package = pkgs.modern-web-guidance;
  skillsDir = "${package}/share/modern-web-guidance/skills";
  availableSkills = builtins.attrNames (
    lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir)
  );
  selectedSkills = builtins.listToAttrs (
    map (name: lib.nameValuePair name "${skillsDir}/${name}") cfg.skills
  );
in
{
  options.programs.modern-web-guidance = {
    enable = lib.mkEnableOption "Modern Web Guidance skills and CLI";

    skills = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableSkills);
      default = [ "modern-web-guidance" ];
      example = [
        "modern-web-guidance"
        "chrome-extensions"
      ];
      description = "Modern Web Guidance upstream skill folder names to expose to supported LLM clients.";
    };
  };

  config = lib.mkIf cfg.enable {
    # The modern-web-guidance skill runs the CLI by name.
    home.packages = [ package ];
    programs.ai.skills = lib.mapAttrs (_: source: { inherit source; }) selectedSkills;
  };
}
