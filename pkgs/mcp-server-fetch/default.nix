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
  version = "2025.9.25-unstable-2025-11-17";

  src = fetchFromGitHub {
    owner = "modelcontextprotocol";
    repo = "servers";
    rev = "28a313206c7f1350ba946a923044f2f05a5a54f1";
    sha256 = "sha256-PWV4vnyA+HMI/y9f+tDgHYtcQg3swiqA8kPP+7aHYhI=";
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
