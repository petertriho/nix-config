{
  pkgs ? import <nixpkgs> { },
  ...
}:
rec {
  angular-language-server = pkgs.callPackage ./angular-language-server { };
  fish-lsp = pkgs.callPackage ./fish-lsp { };
  pybetter = pkgs.callPackage ./pybetter { inherit pkgs pyemojify; };
  pyemojify = pkgs.callPackage ./pyemojify { };
  sort-package-json = pkgs.callPackage ./sort-package-json { };
  ssort = pkgs.callPackage ./ssort { };
}
