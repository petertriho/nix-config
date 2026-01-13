{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
{
  ctags-lsp = callPackage ./ctags-lsp { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  shellock = callPackage ./shellock { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
