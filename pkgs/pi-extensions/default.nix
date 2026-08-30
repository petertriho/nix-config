{ pkgs, ... }:
with pkgs;
let
  rpiv-mono = callPackage ./rpiv-mono { };

  # Shared postPatch builder that jq-strips the pi-injected peer/dev
  # dependency groups out of package.json in place; see strip-manifest.nix.
  stripNpmManifest = callPackage ./strip-manifest.nix { };
in
{
  omp-undo-redo = callPackage ./omp-undo-redo { };
  pi-agent-browser-native = callPackage ./pi-agent-browser-native {
    inherit stripNpmManifest;
  };
  pi-autoresearch = callPackage ./pi-autoresearch { };
  pi-cache-optimizer = callPackage ./pi-cache-optimizer { };
  pi-codex-tools = callPackage ./pi-codex-tools {
    inherit stripNpmManifest;
  };
  pi-fzfp = callPackage ./pi-fzfp { };
  pi-history = callPackage ./pi-history { };
  pi-lens = callPackage ./pi-lens {
    inherit stripNpmManifest;
  };
  pi-mcp-adapter = callPackage ./pi-mcp-adapter {
    inherit stripNpmManifest;
  };
  pi-subagents = callPackage ./pi-subagents {
    inherit stripNpmManifest;
  };
  pi-tasks = callPackage ./pi-tasks {
    inherit stripNpmManifest;
  };
  pi-vcc = callPackage ./pi-vcc { };
  pi-vim = callPackage ./pi-vim { };
  rpiv-args = callPackage ./rpiv-args { inherit (rpiv-mono) src version; };
  rpiv-ask-user-question = callPackage ./rpiv-ask-user-question {
    inherit (rpiv-mono) src version typebox;
  };
  rpiv-todo = callPackage ./rpiv-todo {
    inherit (rpiv-mono) src version typebox;
  };
}
