{
  pkgs ? import <nixpkgs> { },
  inputs ? { },
  ...
}:
with pkgs;
{
  anthropic-skills = callPackage ./anthropic-skills { };
  basic-memory = callPackage ./basic-memory { };
  excalidraw-mcp = callPackage ./excalidraw-mcp { };
  claude-custom =
    let
      tweakcc-pkg = callPackage ./tweakcc { };
    in
    callPackage ./claude-custom {
      claude-code = inputs.llm-agents.packages.${stdenv.hostPlatform.system}.claude-code;
      tweakccConfig = ../dotfiles/tweakcc/.tweakcc/config.json;
      tweakcc = tweakcc-pkg;
    };
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
  tweakcc = callPackage ./tweakcc { };
  tmuxai = callPackage ./tmuxai { };
  uipro = callPackage ./uipro { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
