{
  config,
  lib,
  ...
}:

let
  cfg = config.programs.agents;
  skillsDir = ../../../dotfiles/agents/.agents/skills;
  skillEntries = builtins.readDir skillsDir;
  excludedSkills = [ "autoresearch" ];
  availableSkills = lib.filterAttrs (
    name: type: type == "directory" && !(lib.elem name excludedSkills)
  ) skillEntries;
  skillCommands = lib.mapAttrs' (
    name: _:
    lib.nameValuePair name ''
      ---
      description: Run the ${name} skill
      ---
      Load the `${name}` skill with the `skill` tool, then follow its instructions for this request.

      If no request is provided, ask for the missing input required by the skill.

      User request:
      $ARGUMENTS
    ''
  ) availableSkills;
in
{
  options.programs.agents = {
    skills.enable = lib.mkEnableOption "agents skills";
  };

  config = lib.mkIf cfg.skills.enable (
    lib.mkMerge [
      {
        home.file = lib.mapAttrs' (
          name: _:
          lib.nameValuePair ".agents/skills/${name}" {
            source = config.lib.meta.mkDotfilesSymlink "agents/.agents/skills/${name}";
          }
        ) availableSkills;

        # Pi and OpenCode read `~/.agents/skills` natively; each entry is an
        # out-of-store symlink, so the sandbox needs the tracked target.
        programs.nono.agentFilesystem = lib.genAttrs [ "pi" "opencode" ] (_: {
          read = [ "$HOME/.nix-config/dotfiles/agents/.agents/skills" ];
        });

        programs.ai.skills = lib.mapAttrs (name: _: {
          source = skillsDir + "/${name}";
          clients = {
            opencode = {
              enable = false;
              commands.${name} = skillCommands.${name};
            };
            codex.enable = false;
            # Pi natively scans ~/.agents/skills; rendering these generic
            # skills into Pi's own skill directory would duplicate them.
            pi.enable = false;
          };
        }) availableSkills;
      }
    ]
  );
}
