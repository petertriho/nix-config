{ pkgs, ... }:
with pkgs;
let
  pythonInputs = python3.withPackages (
    p: with p; [
      libtmux
      pip
    ]
  );
in
{
  easy-motion = callPackage ./easy-motion { inherit pkgs pythonInputs; };
  tmux-sessionist-fork = callPackage ./tmux-sessionist-fork { };
  tmux-window-name = callPackage ./tmux-window-name { inherit pkgs pythonInputs; };
}
