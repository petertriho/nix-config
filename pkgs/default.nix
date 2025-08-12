{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
rec {
  ccusage = callPackage ./ccusage { };
  goose-cli = callPackage ./goose-cli { };
  mbake = callPackage ./mbake { };
  models-dev = callPackage ./models-dev { };
  opencode = callPackage ./opencode { inherit models-dev; };
  pybetter = callPackage ./pybetter { inherit pkgs pyemojify; };
  pyemojify = callPackage ./pyemojify { };
  pyrefly = callPackage ./pyrefly { };
  sesh = callPackage ./sesh { };
  sort-package-json = callPackage ./sort-package-json { };
  ty = callPackage ./ty { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
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
