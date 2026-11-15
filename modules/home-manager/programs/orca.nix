{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.orca;

  skillsDir = "${cfg.skillsPackage.src}/skills";
  availableSkills = builtins.attrNames (
    lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir)
  );
  skillSource =
    name:
    if cfg.skillDescriptions ? ${name} then
      config.lib.meta.mkSkillWithDescription {
        name = "orca-${name}";
        source = "${skillsDir}/${name}";
        description = cfg.skillDescriptions.${name};
      }
    else
      "${skillsDir}/${name}";
in
{
  options.programs.orca = {
    enable = lib.mkEnableOption "Orca, the agent development environment, and its agent skills";

    package = lib.mkPackageOption pkgs [ "llm-agents" "orca" ] {
      nullable = true;
      extraDescription = "Set it to `null` when something else installs Orca, such as the Homebrew cask on macOS.";
    };

    finalPackage = lib.mkOption {
      type = lib.types.nullOr lib.types.package;
      readOnly = true;
      internal = true;
      description = "The Orca package with the upstream Linux command names.";
    };

    skillsPackage = lib.mkPackageOption pkgs "orca-skills" { };

    skills = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableSkills);
      # The skills that Orca's own agent setup installs.
      default = [
        "orca-cli"
        "orca-computer-use"
        "orchestration"
      ];
      description = "Orca upstream skill folder names to expose to supported LLM clients.";
    };

    skillDescriptions = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = {
        orca-cli = "Operate Orca worktrees and terminals through the `orca` CLI. Use only when the user names Orca.";
      };
      description = ''
        Replacement `description` values for selected skills, keyed by skill
        folder name. Use them when another tool's skills claim the same
        requests.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.package == null || pkgs.stdenv.hostPlatform.isLinux;
        message = "programs.orca.package supports only Linux. On macOS, install the `stablyai/orca/orca` Homebrew cask and set programs.orca.package to null.";
      }
      {
        assertion = lib.all (name: lib.elem name cfg.skills) (lib.attrNames cfg.skillDescriptions);
        message = "programs.orca.skillDescriptions names a skill that is not in programs.orca.skills.";
      }
    ];

    # Upstream's deb makes `orca-ide` the CLI, and Orca's skill stubs run
    # `orca-ide` outside Orca terminals on Linux, because bare `orca` is
    # usually the GNOME screen reader. llm-agents makes `orca-ide` start the
    # GUI, so the GUI moves to `orca-ide-gui`. The CLI shim finds Electron
    # relative to its real path, so a link from `bin/` works.
    programs.orca.finalPackage =
      if cfg.package == null then
        null
      else
        pkgs.symlinkJoin {
          name = "${cfg.package.name}-cli-names";
          paths = [ cfg.package ];
          postBuild = ''
            ln -s ${cfg.package}/bin/orca-ide $out/bin/orca-ide-gui
            ln -sfn ${cfg.package}/lib/Orca/resources/bin/orca-ide $out/bin/orca-ide

            rm $out/share/applications/orca-ide.desktop
            substitute ${cfg.package}/share/applications/orca-ide.desktop \
              $out/share/applications/orca-ide.desktop \
              --replace-fail "Exec=orca-ide " "Exec=orca-ide-gui "

            # Fail loudly if the llm-agents layout changes.
            for cmd in orca orca-ide orca-ide-gui; do
              test -x "$out/bin/$cmd"
            done
            grep -qx 'Exec=orca-ide-gui %U' $out/share/applications/orca-ide.desktop
          '';
          inherit (cfg.package) meta;
        };

    home.packages = lib.optional (cfg.finalPackage != null) cfg.finalPackage;

    programs.ai.skills = lib.genAttrs cfg.skills (name: {
      source = skillSource name;
    });
  };
}
