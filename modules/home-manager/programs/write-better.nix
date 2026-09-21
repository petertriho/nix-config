{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.write-better;
  skillsDir = "${pkgs.write-better}/share/write-better/skills";
  availableSkills = builtins.attrNames (
    lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir)
  );
  selectedSkills = builtins.listToAttrs (
    map (name: lib.nameValuePair name "${skillsDir}/${name}") cfg.skills
  );
in
{
  options.programs.write-better = {
    enable = lib.mkEnableOption "Write Better writing skills";

    skills = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableSkills);
      default = availableSkills;
      example = [
        "asd-ste100"
        "write-better"
      ];
      description = "Write Better upstream skill folder names to expose to supported LLM clients.";
    };
  };

  config = lib.mkIf cfg.enable {
    programs.ai.skills = lib.mapAttrs (_: source: { inherit source; }) selectedSkills;
  };
}
