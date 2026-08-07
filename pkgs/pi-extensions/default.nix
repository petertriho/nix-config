{ pkgs, ... }:
with pkgs;
let
  rpiv-mono = callPackage ./rpiv-mono { };
in
{
  omp-undo-redo = callPackage ./omp-undo-redo { };
  pi-autoresearch = callPackage ./pi-autoresearch { };
  pi-atelier = callPackage ./pi-atelier { };
  pi-blackhole = callPackage ./pi-blackhole { };
  pi-cache-optimizer = callPackage ./pi-cache-optimizer { };
  pi-dynamic-workflows = callPackage ./pi-dynamic-workflows { };
  pi-history = callPackage ./pi-history { };
  pi-lens = callPackage ./pi-lens { };
  pi-mcp-adapter = callPackage ./pi-mcp-adapter { };
  pi-subagents = callPackage ./pi-subagents { };
  pi-tasks = callPackage ./pi-tasks { };
  pi-vcc = callPackage ./pi-vcc { };
  pi-web-access = callPackage ./pi-web-access { };
  rpiv-args = callPackage ./rpiv-args { inherit (rpiv-mono) src version; };
  rpiv-ask-user-question = callPackage ./rpiv-ask-user-question {
    inherit (rpiv-mono) src version typebox;
  };
  rpiv-todo = callPackage ./rpiv-todo {
    inherit (rpiv-mono) src version typebox;
  };
}
