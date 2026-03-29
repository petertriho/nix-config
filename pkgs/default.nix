{
  pkgs ? import <nixpkgs> { },
  inputs ? { },
  ...
}:
with pkgs;
{
  excalidraw-mcp = callPackage ./excalidraw-mcp { };
  chunkhound = callPackage ./chunkhound {
    inherit (inputs) pyproject-nix uv2nix pyproject-build-systems;
  };
  figlet-fonts = callPackage ./figlet-fonts { };
  ilmari = callPackage ./ilmari { };
  kubectl-prof = callPackage ./kubectl-prof { };
  impeccable = callPackage ./impeccable { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  models = callPackage ./models { };
  playwriter = callPackage ./playwriter { };
  pinchtab = callPackage ./pinchtab { };
  plannotator = callPackage ./plannotator { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  sort-package-json = callPackage ./sort-package-json { };
  superpowers = callPackage ./superpowers { };
  tmuxai = callPackage ./tmuxai { };
  uipro = callPackage ./uipro { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
