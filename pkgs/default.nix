{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
rec {
  angular-language-server = callPackage ./angular-language-server { };
  pybetter = callPackage ./pybetter { inherit pkgs pyemojify; };
  pyemojify = callPackage ./pyemojify { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
}
