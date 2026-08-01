{ pkgs, ... }:
with pkgs;
{
  pi-atelier = callPackage ./pi-atelier { };
  pi-lens = callPackage ./pi-lens { };
  pi-mcp-adapter = callPackage ./pi-mcp-adapter { };
}
