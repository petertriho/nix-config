{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
rec {
  angular-language-server = callPackage ./angular-language-server { };
  fish-lsp = callPackage ./fish-lsp { };
  pybetter = callPackage ./pybetter { inherit pkgs pyemojify; };
  pyemojify = callPackage ./pyemojify { };
  sort-package-json = callPackage ./sort-package-json { };
  ssort = callPackage ./ssort { };
  vim-custom = callPackage ./vim-custom { };
}
