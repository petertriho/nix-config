{ pkgs, ... }:
with pkgs;
let
  rpiv-mono = callPackage ./rpiv-mono { };

  # Shared postPatch builder that jq-strips the pi-injected peer/dev
  # dependency groups out of package.json in place; see strip-manifest.nix.
  stripNpmManifest = callPackage ./strip-manifest.nix { };
  updateNpmLock = callPackage ./update-npm-lock.nix { };
in
{
  omp-undo-redo = callPackage ./omp-undo-redo { };
  pi-autoresearch = callPackage ./pi-autoresearch { };
  pi-blackhole = callPackage ./pi-blackhole {
    inherit stripNpmManifest updateNpmLock;
  };
  pi-cache-optimizer = callPackage ./pi-cache-optimizer { };
  pi-codex-tools = callPackage ./pi-codex-tools {
    inherit stripNpmManifest updateNpmLock;
  };
  pi-fzfp = callPackage ./pi-fzfp { };
  pi-lens = callPackage ./pi-lens {
    inherit stripNpmManifest updateNpmLock;
  };
  pine-of-glass = callPackage ./pine-of-glass { };
  pi-subagents = callPackage ./pi-subagents {
    inherit stripNpmManifest updateNpmLock;
  };
  pi-tasks = callPackage ./pi-tasks { };
  pi-vcc = callPackage ./pi-vcc { };
  pi-vim = callPackage ./pi-vim { };
  rpiv-args = callPackage ./rpiv-args { inherit (rpiv-mono) src version; };
  rpiv-ask-user-question = callPackage ./rpiv-ask-user-question {
    inherit (rpiv-mono) src version;
  };
  rpiv-todo = callPackage ./rpiv-todo {
    inherit (rpiv-mono) src version typebox;
  };
}
