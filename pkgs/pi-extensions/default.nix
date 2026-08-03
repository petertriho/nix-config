{ pkgs, ... }:
with pkgs;
{
  pi-atelier = callPackage ./pi-atelier { };
  pi-cache-optimizer = callPackage ./pi-cache-optimizer { };
  pi-lens = callPackage ./pi-lens { };
  pi-mcp-adapter = callPackage ./pi-mcp-adapter { };
}
