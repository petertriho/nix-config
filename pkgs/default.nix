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
  openspecui = callPackage ./openspecui { };
  pinchtab = callPackage ./pinchtab { };
  plannotator = callPackage ./plannotator { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  sort-package-json = callPackage ./sort-package-json { };
  superpowers = callPackage ./superpowers { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
