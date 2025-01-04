{ ... }:
{
  imports = [
    ./base.nix
    ./pkgs/wezterm.nix
  ];

  programs.tmux.terminal = "screen-256color";
}
