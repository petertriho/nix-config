{
  pkgs ? import <nixpkgs> { },
  inputs ? { },
  ...
}:
let
  stablePkgs = import inputs.nixpkgs-stable {
    system = pkgs.stdenv.hostPlatform.system;
    config = {
      allowUnfree = true;
      allowBroken = true;
    };
  };
in
with pkgs;
{
  anthropic-skills = callPackage ./anthropic-skills { };
  basic-memory = callPackage ./basic-memory { };
  basic-memory-skills = callPackage ./basic-memory-skills { };
  excalidraw-mcp = callPackage ./excalidraw-mcp { };
  chunkhound = callPackage ./chunkhound {
    inherit (inputs) pyproject-nix uv2nix pyproject-build-systems;
  };
  figlet-fonts = callPackage ./figlet-fonts { };
  ilmari = callPackage ./ilmari { };
  kubectl-prof = callPackage ./kubectl-prof {
    buildGoModule = stablePkgs.buildGo126Module;
  };
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
