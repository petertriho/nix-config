{
  inputs,
  pkgs,
  config,
  ...
}:
{
  imports = [
    ./base.nix
    inputs.vicinae.homeManagerModules.default
    ./pkgs/alacritty.nix
    ./pkgs/ghostty.nix
    ./pkgs/hyprland.nix
    ./pkgs/niri.nix
    ./pkgs/quickshell.nix
    ./pkgs/vicinae.nix
  ];
  home.packages = with pkgs; [
    floorp-bin
    ungoogled-chromium
  ];
  programs.claude-code.zai.enable = true;

  xdg.configFile."mimeapps.list".source = config.lib.meta.mkDotfilesSymlink "mimeapps/.config/mimeapps.list";
}
