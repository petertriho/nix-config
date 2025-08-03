{
  config,
  pkgs,
  ...
}:
{
  programs = {
    direnv = {
      enable = true;
      nix-direnv.enable = true;
    };
  };

  home.packages = with pkgs; [ devenv ];

  xdg.configFile."direnv/direnvrc".source =
    config.lib.meta.mkDotfilesSymlink "direnv/.config/direnv/direnvrc";

  home.sessionVariables.DIRENV_LOG_FORMAT = "";
}
