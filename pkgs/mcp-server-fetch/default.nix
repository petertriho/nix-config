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
  version = "2025.11.25-unstable-2025-12-06";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "05f506b3b1877ad408c99ab62753a2ec89973097";
    sha256 = "sha256-ZkciqWO85s/PU/mGzgwzzHd+s4VAWqFETiSrwWGiVkE=";
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
