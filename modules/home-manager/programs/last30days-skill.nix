{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.last30days-skill;
  skillDir = "${pkgs.last30days-skill}/share/last30days-skill/skills/last30days";
in
{
  options.programs.last30days-skill = {
    enable = lib.mkEnableOption "last30days skill";

    memoryDir = lib.mkOption {
      type = lib.types.str;
      default = "${config.home.homeDirectory}/Documents/Last30Days";
      description = "Directory where last30days saves raw research files.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = with pkgs; [
      nodejs
      python3
      yt-dlp
    ];
    home.sessionVariables.LAST30DAYS_MEMORY_DIR = cfg.memoryDir;
    programs.ai.resources.skills.last30days.source = skillDir;
  };
}
