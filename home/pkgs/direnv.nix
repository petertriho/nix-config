{ config, ... }:
{
  programs = {
    direnv = {
      enable = true;
      enableBashIntegration = true;
      nix-direnv.enable = true;
    };

    bash.enable = true;
  };

  xdg.configFile."direnv/direnvrc".source = config.lib.meta.mkDotfilesSymlink "direnv/.config/direnv/direnvrc";

  home.sessionVariables.DIRENV_LOG_FORMAT = "";
}
