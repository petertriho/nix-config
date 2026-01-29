{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
{
  figlet-fonts = callPackage ./figlet-fonts { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  ralph-tui = callPackage ./ralph-tui { };
  shellock = callPackage ./shellock { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
