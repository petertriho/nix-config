{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.paseo;
  # The package output has no skills, so read them from the source of the same version.
  skillsDir = "${cfg.package.src}/skills";
  availableSkills = builtins.attrNames (
    lib.filterAttrs (_: type: type == "directory") (builtins.readDir skillsDir)
  );
  selectedSkills = builtins.listToAttrs (
    map (name: lib.nameValuePair name "${skillsDir}/${name}") cfg.skills
  );
in
{
  options.programs.paseo = {
    enable = lib.mkEnableOption "Paseo daemon, CLI, web UI, and agent skills";

    package = lib.mkPackageOption pkgs "paseo" { };

    skills = lib.mkOption {
      type = lib.types.listOf (lib.types.enum availableSkills);
      default = availableSkills;
      defaultText = lib.literalMD "all skill directories in the package source";
      example = [
        "paseo"
        "paseo-handoff"
      ];
      description = "Paseo upstream skill folder names to expose to supported LLM clients.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
    programs.ai.skills = lib.mapAttrs (_: source: { inherit source; }) selectedSkills;

    # Use the Paseo CLI, not `lib.hm.generators.mkImpureConfigMerger`. A raw merge can create
    # config.json without `daemon.relay.enabled`, and the daemon then enables the relay. The CLI
    # writes the full defaults first. A failure only warns, so an invalid config.json does not
    # block the switch. Activation never starts, stops, or restarts the daemon.
    home.activation.paseoConfig = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
      paseoConfigSet() {
        if ! run --quiet ${lib.getExe cfg.package} daemon config set "$1" "$2"; then
          warnEcho "Paseo: could not set $1. Fix ~/.paseo/config.json, then run: paseo daemon config set $1 $2"
        fi
      }
      paseoConfigSet features.webUi.enabled true
      paseoConfigSet daemon.mcp.injectIntoAgents true
      unset -f paseoConfigSet
    '';
  };
}
