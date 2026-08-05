{ pkgs, ... }:
with pkgs;
{
  omp-undo-redo = callPackage ./omp-undo-redo { };
  pi-atelier = callPackage ./pi-atelier { };
  pi-blackhole = callPackage ./pi-blackhole { };
  pi-cache-optimizer = callPackage ./pi-cache-optimizer { };
  pi-lens = callPackage ./pi-lens { };
  pi-mcp-adapter = callPackage ./pi-mcp-adapter { };
  pi-web-access = callPackage ./pi-web-access { };
}
