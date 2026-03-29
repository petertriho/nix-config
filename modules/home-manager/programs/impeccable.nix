{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.impeccable;
  pkg = pkgs.impeccable;

  opencodeSkills = builtins.readDir "${pkg}/share/impeccable/dist/opencode-prefixed/.opencode/skills";
  claudeCodeSkills = builtins.readDir "${pkg}/share/impeccable/dist/claude-code-prefixed/.claude/skills";
  codexSkills = builtins.readDir "${pkg}/share/impeccable/dist/codex-prefixed/.codex/skills";
in
{
  options.programs.impeccable.enable = lib.mkEnableOption "impeccable design skills";

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      # opencode skills
      {
        xdg.configFile = lib.mapAttrs' (
          name: _:
          lib.nameValuePair "opencode/skills/impeccable/${name}" {
            source = "${pkg}/share/impeccable/dist/opencode-prefixed/.opencode/skills/${name}";
          }
        ) opencodeSkills;
      }
      # claude-code skills
      (lib.mkIf config.programs.claude-code.enable {
        programs.claude-code.skills = lib.mapAttrs' (
          name: _:
          lib.nameValuePair name "${pkg}/share/impeccable/dist/claude-code-prefixed/.claude/skills/${name}"
        ) claudeCodeSkills;
      })
      # codex skills
      (lib.mkIf config.programs.codex.enable {
        programs.codex.skills = lib.mapAttrs' (
          name: _: lib.nameValuePair name "${pkg}/share/impeccable/dist/codex-prefixed/.codex/skills/${name}"
        ) codexSkills;
      })
    ]
  );
}
