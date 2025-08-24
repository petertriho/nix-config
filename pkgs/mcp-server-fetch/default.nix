# https://github.com/natsukium/mcp-servers-nix/tree/main
{
  lib,
  fetchFromGitHub,
  python3Packages,
}:
python3Packages.buildPythonApplication rec {
  pname = "mcp-server-fetch";
  version = "2025.8.21-unstable-2025-08-23";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "338d8af7a6d117b848d42e07b9ac480e16b80343";
    sha256 = "sha256-rjiFfvo575Cxjmeh7bJzZ3UkFaVnoFdb/tfO2Pef/3o=";
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
