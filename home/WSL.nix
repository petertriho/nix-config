{ ... }:
{
  imports = [ ./base.nix ];

  programs.tmux.terminal = "screen-256color";
}
