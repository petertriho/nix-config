{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.mattpocock-skills;
  skillsDir = "${pkgs.mattpocock-skills}/share/mattpocock-skills/skills";
  directoryNames =
    path: builtins.attrNames (lib.filterAttrs (_: type: type == "directory") (builtins.readDir path));
  availableFolders = directoryNames skillsDir;
  availableSkillsByFolder = builtins.listToAttrs (
    map (folder: lib.nameValuePair folder (directoryNames "${skillsDir}/${folder}")) availableFolders
  );
  selectedSkills = lib.concatMapAttrs (
    folder: skills:
    builtins.listToAttrs (map (skill: lib.nameValuePair skill "${skillsDir}/${folder}/${skill}") skills)
  ) cfg.skills;
in
{
  options.programs.mattpocock-skills = {
    enable = lib.mkEnableOption "Matt Pocock skills";

    skills = lib.mkOption {
      type = lib.types.attrsOf (lib.types.listOf lib.types.str);
      default = { };
      example = {
        engineering = [
          "diagnose"
          "grill-with-docs"
        ];
      };
      description = ''
        Matt Pocock skill subdirectories to expose to supported LLM clients,
        grouped by their top-level folder under the upstream skills directory.
      '';
    };
  };

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        assertions = lib.concatLists (
          lib.mapAttrsToList (
            folder: skills:
            [
              {
                assertion = lib.elem folder availableFolders;
                message = ''
                  programs.mattpocock-skills.skills.${folder} is not an available Matt Pocock skills folder.
                  Available folders: ${lib.concatStringsSep ", " availableFolders}
                '';
              }
            ]
            ++ map (skill: {
              assertion = lib.elem skill (availableSkillsByFolder.${folder} or [ ]);
              message = ''
                programs.mattpocock-skills.skills.${folder} includes unavailable skill ${skill}.
                Available skills: ${lib.concatStringsSep ", " (availableSkillsByFolder.${folder} or [ ])}
              '';
            }) skills
          ) cfg.skills
        );
      }
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
