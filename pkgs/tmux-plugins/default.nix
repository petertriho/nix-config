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
  tinted = callPackage ./tinted { };
  session-wizard = callPackage ./session-wizard { };
  sessionist-fork = callPackage ./sessionist-fork { };
  tokyo-night = callPackage ./tokyo-night { };
  window-name = callPackage ./window-name { inherit pkgs pythonInputs; };
}
