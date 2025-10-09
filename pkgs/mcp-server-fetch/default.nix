# https://github.com/natsukium/mcp-servers-nix/tree/main
{
  lib,
  fetchFromGitHub,
  python3Packages,
  ...
}:
let
  readabilipy = python3Packages.readabilipy.overridePythonAttrs (oldAttrs: {
    doCheck = false;
  });
in
python3Packages.buildPythonApplication rec {
  pname = "mcp-server-fetch";
  version = "2025.9.25-unstable-2025-10-08";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "6e83843716ad28479797419826c39355b438350c";
    sha256 = "sha256-+Jd9Gm0ac0nMkV40Yu2zEwU5c5fP/4IjPxcT+Wsy4Wg=";
  };

  pyproject = true;
  sourceRoot = "${src.name}/src/fetch";

  patches = [ ./fix-httpx-proxies.patch ];

  build-system = [ python3Packages.hatchling ];

  dependencies = with python3Packages; [
    markdownify
    mcp
    protego
    pydantic
    readabilipy
    requests
  ];

  pythonRelaxDeps = [ "httpx" ];

  doCheck = false;

  pythonImportsCheck = [ "mcp_server_fetch" ];

  meta = {
    description = "Model Context Protocol Server for web content fetching";
    homepage = "https://github.com/modelcontextprotocol/servers";
    license = lib.licenses.mit;
    mainProgram = "mcp-server-fetch";
  };
}
