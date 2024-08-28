{ ... }:
{
  imports = [
    ./base.nix
    ./pkgs/wezterm.nix
  ];

  home = {
    homeDirectory = "/Users/peter";
  };
}
