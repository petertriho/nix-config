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

  config = lib.mkIf cfg.enable {
    programs.ai.resources.skills.impeccable = {
      source = "${pkgs.impeccable}/share/impeccable/dist/opencode/.opencode/skills/impeccable";
      clients.claude-code.source = "${pkgs.impeccable}/share/impeccable/dist/claude-code/.claude/skills/impeccable";
    };
  };
}
