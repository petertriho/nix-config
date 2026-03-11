{
  config,
  inputs,
  pkgs,
  ...
}:
{
  imports = [ inputs.direnv-instant.homeModules.direnv-instant ];

  programs = {
    direnv = {
      enable = true;
      nix-direnv.enable = true;
    };
    direnv-instant.enable = true;
  };
  home = {
    packages = with pkgs; [ devenv ];
    sessionVariables.DIRENV_LOG_FORMAT = "";
  };

  xdg.configFile."direnv/direnvrc".source =
    config.lib.meta.mkDotfilesSymlink "direnv/.config/direnv/direnvrc";
}
