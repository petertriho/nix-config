{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
rec {
  angular-language-server = callPackage ./angular-language-server { };
  pybetter = callPackage ./pybetter { inherit pkgs pyemojify; };
  pyemojify = callPackage ./pyemojify { };
  pylint = callPackage ./pylint {
    inherit (pkgs)
      fetchFromGitHub
      ;
    inherit (pkgs.python3Packages)
      astroid
      buildPythonPackage
      dill
      gitpython
      isort
      mccabe
      platformdirs
      py
      pytest-timeout
      pytest-xdist
      pytest7CheckHook
      pythonOlder
      requests
      setuptools
      tomli
      tomlkit
      typing-extensions
      pylint-venv
      ;
  };
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
