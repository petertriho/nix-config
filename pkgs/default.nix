{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
rec {
  amazon-q-cli = callPackage ./amazon-q-cli { };
  ccusage = callPackage ./ccusage { };
  context7-mcp = callPackage ./context7-mcp { };
  mcp-server-fetch = callPackage ./mcp-server-fetch { };
  mcp-server-sequential-thinking = callPackage ./mcp-server-sequential-thinking { };
  mighty-security = callPackage ./mighty-security { inherit pkgs; };
  models-dev = callPackage ./models-dev { };
  opencode = callPackage ./opencode { inherit models-dev; };
  postgres-mcp = callPackage ./postgres-mcp { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  serena = callPackage ./serena { };
  sesh = callPackage ./sesh { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
