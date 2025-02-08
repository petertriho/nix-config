{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
rec {
  angular-language-server = callPackage ./angular-language-server { };
  basedpyright = callPackage ./basedpyright { };
  kanata-macos = callPackage ./kanata-macos { };
  pybetter = callPackage ./pybetter { inherit pkgs pyemojify; };
  pyemojify = callPackage ./pyemojify { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  yamlfix = callPackage ./yamlfix {
    inherit (pkgs.python3Packages)
      buildPythonPackage
      click
      maison
      pdm-backend
      pytest-freezegun
      pytest-xdist
      pytestCheckHook
      pythonOlder
      ruyaml
      setuptools
      ;
  };
}
