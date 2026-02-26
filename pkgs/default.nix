{
  pkgs ? import <nixpkgs> { },
  inputs ? { },
  ...
}:
with pkgs;
{
  beads-ui = callPackage ./beads-ui { };
  chunkhound = callPackage ./chunkhound {
    inherit (inputs) pyproject-nix uv2nix pyproject-build-systems;
  };
  figlet-fonts = callPackage ./figlet-fonts { };
  get-shit-done = callPackage ./get-shit-done { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  openspecui = callPackage ./openspecui { };
  plannotator = callPackage ./plannotator { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  ralph-tui = callPackage ./ralph-tui { };
  shellock = callPackage ./shellock { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
