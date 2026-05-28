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
  betterfox = callPackage ./betterfox { };
  basic-memory = callPackage ./basic-memory { };
  basic-memory-skills = callPackage ./basic-memory-skills { };
  cpa-manager = callPackage ./cpa-manager { };
  excalidraw-edit = callPackage ./excalidraw-edit { };
  excalidraw-mcp = callPackage ./excalidraw-mcp { };
  chunkhound = callPackage ./chunkhound {
    inherit (inputs) pyproject-nix uv2nix pyproject-build-systems;
  };
  context-mode = callPackage ./context-mode { };
  figlet-fonts = callPackage ./figlet-fonts { };
  graphify = callPackage ./graphify { };
  kubectl-prof = callPackage ./kubectl-prof {
    buildGoModule = stablePkgs.buildGo126Module;
  };
  lg-buddy = callPackage ./lg-buddy { };
  mattpocock-skills = callPackage ./mattpocock-skills { };
  impeccable = callPackage ./impeccable { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  open-design = callPackage ./open-design { };
  playwriter = callPackage ./playwriter { };
  pinchtab = callPackage ./pinchtab { };
  plannotator = callPackage ./plannotator { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  react-doctor = callPackage ./react-doctor { };
  sort-package-json = callPackage ./sort-package-json { };
  superpowers = callPackage ./superpowers { };
  taste-skill = callPackage ./taste-skill { };
  tokscale = callPackage ./tokscale { };
  uipro = callPackage ./uipro { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
