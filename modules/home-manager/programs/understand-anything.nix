{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.understand-anything;
  pluginRoot = "${cfg.package}/share/understand-anything/understand-anything-plugin";
  skillsDir = "${pluginRoot}/skills";
  availableSkills = lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir);
in
{
  options.programs.understand-anything = {
    enable = lib.mkEnableOption "Understand Anything plugin and skills";
    package = lib.mkPackageOption pkgs "understand-anything" { };
  };

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        home = {
          packages = [ cfg.package ];
          file = {
            ".understand-anything-plugin".source = pluginRoot;
          }
          // lib.mapAttrs' (
            name: _:
            lib.nameValuePair ".agents/skills/${name}" {
              source = "${skillsDir}/${name}";
            }
          ) availableSkills;
        };
      }
      (lib.mkIf config.programs.claude-code.enable {
        programs.claude-code.plugins = lib.mkAfter [ pluginRoot ];
      })
    ]
  );
}
