{
  pkgs ? import <nixpkgs> { },
  ...
}:
rec {
  fish-lsp = pkgs.callPackage ./fish-lsp { };
  pybetter = pkgs.callPackage ./pybetter { inherit pkgs pyemojify; };
  pyemojify = pkgs.callPackage ./pyemojify { };
  sort-package-json = pkgs.callPackage ./sort-package-json { };
  ssort = pkgs.callPackage ./ssort { };
}
