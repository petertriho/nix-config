{
  pkgs ? import <nixpkgs> { },
  ...
}:
with pkgs;
{
  context7-mcp = callPackage ./context7-mcp { };
  copilot-language-server = callPackage ./copilot-language-server { };
  mcp-server-fetch = callPackage ./mcp-server-fetch { };
  mcp-server-sequential-thinking = callPackage ./mcp-server-sequential-thinking { };
  mighty-security = callPackage ./mighty-security { inherit pkgs; };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  serena = callPackage ./serena { };
  sort-package-json = callPackage ./sort-package-json { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
