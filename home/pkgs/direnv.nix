{ config, ... }:
{
  programs = {
    direnv = {
      enable = true;
      nix-direnv.enable = true;
    };
  };

  xdg.configFile."direnv/direnvrc".source = config.lib.meta.mkDotfilesSymlink "direnv/.config/direnv/direnvrc";

  home.sessionVariables.DIRENV_LOG_FORMAT = "";
}
