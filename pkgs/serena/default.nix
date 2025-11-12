# https://github.com/nixvital/ml-pkgs/blob/main/gen-ai/serena/default.nix
{
  lib,
  pkgs,
  fetchFromGitHub,
  python3Packages,
  ...
}:
with python3Packages;
buildPythonPackage {
  pname = "serena-agent";
  version = "0.1.4-unstable-2025-11-11";

  pyproject = true;

  src = fetchFromGitHub {
    owner = "oraios";
    repo = "serena";
    rev = "c0fc9d3756fa0f1be79b7d25d1db15d8358320a3";
    sha256 = "sha256-i07vxTHgeKIUXHFxtQC3sqMiOERS1tKt3LiWPXLisPw=";
  };

  patches = [
    ./use-basedpyright-langserver.patch
  ];

  build-system = [
    hatchling
  ];

  dependencies = [
    requests
    overrides
    python-dotenv
    mcp
    flask
    sensai-utils
    pydantic
    types-pyyaml
    pyyaml
    ruamel-yaml
    jinja2
    pathspec
    psutil
    docstring-parser
    joblib
    tqdm
    tiktoken
    anthropic
  ];

  optional-dependencies = {
    dev = [
      black
      poethepoet
      toml-sort
      syrupy
      pytest
      ruff
      jinja2
      pytest-xdist
      mypy
      types-pyyaml
    ];
    agno = [
      agno
      sqlalchemy
    ];
    google = [
      google-genai
    ];
  };

  pythonRelaxDeps = [
    "joblib"
    "mcp"
    "sensai-utils"
  ];

  pythonRemoveDeps = [
    "dotenv"
    "pyright" # patched to use the basedpyright binary directly
  ];

  postFixup = ''
    wrapProgram $out/bin/serena \
        --set PATH "${lib.makeBinPath [ pkgs.basedpyright ]}"
  '';

  meta = with lib; {
    mainProgram = "serena";
    homepage = "https://github.com/oraios/serena";
    description = ''
      A powerful coding agent toolkit providing semantic retrieval and editing
        capabilities (MCP server & Agno integration)
    '';
    license = licenses.mit;
    # maintainers = with maintainers; [ breakds ];
  };
}
