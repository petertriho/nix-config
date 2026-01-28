{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
{
  pybetter = callPackage ./pybetter { inherit pkgs; };
  ralph-tui = callPackage ./ralph-tui { };
  shellock = callPackage ./shellock { };
  figlet-fonts = callPackage ./figlet-fonts { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
