{ pkgs, ... }:
let
  pythonInputs = pkgs.python3.withPackages (
    p: with p; [
      libtmux
      pip
    ]
  );
in
{
  easy-motion = pkgs.callPackage ./easy-motion { inherit pkgs pythonInputs; };
  tmux-sessionist-fork = pkgs.callPackage ./tmux-sessionist-fork { };

  tmux-window-name = pkgs.callPackage ./tmux-window-name { inherit pkgs pythonInputs; };
}
