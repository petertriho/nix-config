{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
rec {
  ccusage = callPackage ./ccusage { };
  context7-mcp = callPackage ./context7-mcp { };
  mighty-security = callPackage ./mighty-security { inherit pkgs; };
  models-dev = callPackage ./models-dev { };
  opencode = callPackage ./opencode { inherit models-dev; };
  pybetter = callPackage ./pybetter { inherit pkgs pyemojify; };
  pyemojify = callPackage ./pyemojify { };
  serena = callPackage ./serena { inherit pkgs; };
  sesh = callPackage ./sesh { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
