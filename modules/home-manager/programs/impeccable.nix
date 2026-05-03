{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.impeccable;
in
{
  options.programs.impeccable.enable = lib.mkEnableOption "impeccable design skills";

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        xdg.configFile."opencode/skills/impeccable".source =
          "${pkgs.impeccable}/share/impeccable/dist/opencode/.opencode/skills/impeccable";
      }
      (lib.mkIf config.programs.claude-code.enable {
        programs.claude-code.skills.impeccable = "${pkgs.impeccable}/share/impeccable/dist/claude-code/.claude/skills/impeccable";
      })
      (lib.mkIf config.programs.codex.enable {
        programs.codex.skills.impeccable = "${pkgs.impeccable}/share/impeccable/dist/codex/.codex/skills/impeccable";
      })
    ]
  );
}
