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
  jira-beads-sync = callPackage ./jira-beads-sync { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  ralph-tui = callPackage ./ralph-tui { };
  shellock = callPackage ./shellock { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
