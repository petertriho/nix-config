# Evaluate with `nix eval --impure --json --expr` and pass the locked Nixpkgs pkgs.
{
  pkgs,
  lib ? pkgs.lib,
}:
let
  # Different skill sets check discovery and package overrides. A different
  # mainProgram checks that the MCP command selects the named `rea` executable.
  mkPackage =
    name: skills:
    pkgs.runCommand name { meta.mainProgram = "not-rea"; } ''
      mkdir -p "$out/share/rea/skills"
      touch "$out/share/rea/skills/README.md"
      for skill in ${lib.escapeShellArgs skills}; do
        mkdir -p "$out/share/rea/skills/$skill"
        touch "$out/share/rea/skills/$skill/SKILL.md"
      done
    '';
  defaultSkills = [
    "fixture-analysis"
    "fixture-investigation"
  ];
  overrideSkills = [ "fixture-extra" ];
  defaultPackage = mkPackage "rea-module-default" defaultSkills;
  overridePackage = mkPackage "rea-module-override" overrideSkills;
  existingPackage = mkPackage "rea-module-existing" [ ];

  existingMcp = {
    command = "/existing/bin/server";
    args = [ "serve" ];
    toolExposure.example = "direct";
  };
  existingSkill.source = "/existing/skill";

  evaluate =
    configuration:
    lib.evalModules {
      specialArgs.pkgs = pkgs // {
        rea = defaultPackage;
      };
      modules = [
        {
          # Only the shared contribution points are needed for these tests.
          options = {
            home.packages = lib.mkOption {
              type = lib.types.listOf lib.types.package;
              default = [ ];
            };
            programs.ai = {
              mcp = lib.mkOption {
                type = lib.types.attrsOf lib.types.anything;
                default = { };
              };
              skills = lib.mkOption {
                type = lib.types.attrsOf lib.types.anything;
                default = { };
              };
            };
          };
          config = {
            home.packages = [ existingPackage ];
            programs.ai = {
              mcp.existing = existingMcp;
              skills.existing = existingSkill;
            };
          };
        }
        ../../../modules/home-manager/programs/rea.nix
        configuration
      ];
    };

  snapshot = evaluation: {
    packages = builtins.sort builtins.lessThan (map toString evaluation.config.home.packages);
    mcp = evaluation.config.programs.ai.mcp;
    skills = evaluation.config.programs.ai.skills;
  };

  expected = enable: package: skills: {
    packages = builtins.sort builtins.lessThan (
      [ (toString existingPackage) ] ++ lib.optional enable (toString package)
    );
    mcp = {
      existing = existingMcp;
    }
    // lib.optionalAttrs enable {
      rea = {
        command = "${package}/bin/rea";
        args = [ "mcp" ];
      };
    };
    skills = {
      existing = existingSkill;
    }
    // lib.optionalAttrs enable (
      lib.genAttrs skills (name: {
        source = "${package}/share/rea/skills/${name}";
      })
    );
  };

  disabled = evaluate { };
  explicitlyDisabled = evaluate { programs.rea.enable = false; };
  enabled = evaluate { programs.rea.enable = true; };
  overridden = evaluate {
    programs.rea = {
      enable = true;
      package = overridePackage;
    };
  };
in
{
  disabled =
    assert !disabled.config.programs.rea.enable;
    assert snapshot disabled == expected false defaultPackage defaultSkills;
    assert snapshot explicitlyDisabled == expected false defaultPackage defaultSkills;
    true;
  enabled =
    assert enabled.config.programs.rea.package == defaultPackage;
    assert snapshot enabled == expected true defaultPackage defaultSkills;
    true;
  packageOverride =
    assert overridden.config.programs.rea.package == overridePackage;
    assert snapshot overridden == expected true overridePackage overrideSkills;
    true;
  minimalOptions =
    assert
      builtins.attrNames enabled.options.programs.rea == [
        "enable"
        "package"
      ];
    true;
}
