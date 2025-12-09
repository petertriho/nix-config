{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
{
  pybetter = callPackage ./pybetter { inherit pkgs; };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
