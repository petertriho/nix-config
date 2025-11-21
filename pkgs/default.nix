{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
{
  context7-mcp = callPackage ./context7-mcp { };
  mcp-server-fetch = callPackage ./mcp-server-fetch { };
  mcp-server-sequential-thinking = callPackage ./mcp-server-sequential-thinking { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
