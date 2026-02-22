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
  session-wizard = callPackage ./session-wizard { };
  sessionist-fork = callPackage ./sessionist-fork { };
  window-name = callPackage ./window-name { inherit pkgs pythonInputs; };
}
