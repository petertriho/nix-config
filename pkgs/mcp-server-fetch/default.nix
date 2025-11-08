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
  version = "2025.9.25-unstable-2025-11-08";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "65994ca3db466796b8e1e9082d0c2d1855cb73d4";
    sha256 = "sha256-KQ166p3B3eGYb8AdUdmbVVzjlJ1xD0LlclDTe/uBodg=";
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
