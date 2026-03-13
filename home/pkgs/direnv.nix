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
  home = {
    packages = with pkgs; [ devenv ];
    sessionVariables.DIRENV_LOG_FORMAT = "";
  };

  xdg.configFile."direnv/direnvrc".source =
    config.lib.meta.mkDotfilesSymlink "direnv/.config/direnv/direnvrc";
}
