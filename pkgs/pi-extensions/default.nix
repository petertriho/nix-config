{ pkgs, ... }:
with pkgs;
let
  rpiv-mono = callPackage ./rpiv-mono { };
in
{
  omp-undo-redo = callPackage ./omp-undo-redo { };
  pi-atelier = callPackage ./pi-atelier { };
  pi-blackhole = callPackage ./pi-blackhole { };
  pi-cache-optimizer = callPackage ./pi-cache-optimizer { };
  pi-lens = callPackage ./pi-lens { };
  pi-mcp-adapter = callPackage ./pi-mcp-adapter { };
  pi-web-access = callPackage ./pi-web-access { };
  rpiv-args = callPackage ./rpiv-args { inherit (rpiv-mono) src version; };
  rpiv-ask-user-question = callPackage ./rpiv-ask-user-question {
    inherit (rpiv-mono) src version typebox;
  };
  rpiv-todo = callPackage ./rpiv-todo {
    inherit (rpiv-mono) src version typebox;
  };
}
