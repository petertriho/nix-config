{
  config,
  pkgs,
  lib,
  inputs,
  ...
}:
{
  home.packages =
    with pkgs;
    lib.mkIf pkgs.stdenv.isLinux [
      # TODO: revert back to nixpkgs wezterm when textures are fixed
      inputs.wezterm.packages.${pkgs.system}.default
    ];
  xdg.configFile."wezterm".source = config.lib.meta.mkDotfilesSymlink "wezterm/.config/wezterm";
}
