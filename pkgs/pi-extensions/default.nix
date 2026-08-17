{ pkgs, ... }:
with pkgs;
let
  rpiv-mono = callPackage ./rpiv-mono { };

  # Shared postPatch builder that jq-strips the pi-injected peer/dev
  # dependency groups out of package.json in place; see strip-manifest.nix.
  stripNpmManifest = callPackage ./strip-manifest.nix { };

  # Shared helper, not an exported extension: an on-disk @earendil-works/pi-ai
  # for extensions that read pi-ai's own dist off the filesystem.
  pi-ai-runtime = callPackage ./pi-ai { };
in
{
  omp-undo-redo = callPackage ./omp-undo-redo { };
  pi-agent-browser-native = callPackage ./pi-agent-browser-native {
    inherit stripNpmManifest;
  };
  pi-autoresearch = callPackage ./pi-autoresearch { };
  pi-atelier = callPackage ./pi-atelier { };
  pi-blackhole = callPackage ./pi-blackhole { };
  pi-cache-optimizer = callPackage ./pi-cache-optimizer { };
  pi-cliproxyapi-provider = callPackage ./pi-cliproxyapi-provider {
    piAiRuntime = pi-ai-runtime;
  };
  pi-dynamic-workflows = callPackage ./pi-dynamic-workflows {
    inherit stripNpmManifest;
  };
  pi-fzfp = callPackage ./pi-fzfp { };
  pi-hashline-edit-pro = callPackage ./pi-hashline-edit-pro {
    inherit stripNpmManifest;
  };
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
  pi-web-access = callPackage ./pi-web-access {
    inherit stripNpmManifest;
  };
  rpiv-args = callPackage ./rpiv-args { inherit (rpiv-mono) src version; };
  rpiv-ask-user-question = callPackage ./rpiv-ask-user-question {
    inherit (rpiv-mono) src version typebox;
  };
  rpiv-todo = callPackage ./rpiv-todo {
    inherit (rpiv-mono) src version typebox;
  };
}
