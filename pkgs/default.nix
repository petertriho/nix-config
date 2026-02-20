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
  mermaid-ascii = callPackage ./mermaid-ascii { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  ralph-tui = callPackage ./ralph-tui { };
  rivalsearchmcp = callPackage ./rivalsearchmcp {
    inherit (inputs) pyproject-nix uv2nix pyproject-build-systems;
  };
  shellock = callPackage ./shellock { };
  sort-package-json = callPackage ./sort-package-json { };
  superhtml = callPackage ./superhtml { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
