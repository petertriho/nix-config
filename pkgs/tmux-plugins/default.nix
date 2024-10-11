{ pkgs, ... }:
let
  pythonInputs = pkgs.python3.withPackages (
    p: with p; [
      libtmux
      pip
    ]
  );
in
with pkgs;
with tmuxPlugins;
{
  easy-motion = pkgs.callPackage ./easy-motion { inherit pkgs pythonInputs; };
  tmux-sessionist = pkgs.callPackage ./tmux-sessionist { };

  tmux-window-name = pkgs.callPackage ./tmux-window-name { inherit pkgs pythonInputs; };
}
