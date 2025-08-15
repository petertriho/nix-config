# https://github.com/nixvital/ml-pkgs/blob/main/gen-ai/serena/default.nix
{
  lib,
  pkgs,
}:
pkgs.python3Packages.buildPythonPackage {
  pname = "serena-agent";
  version = "0.1.3-unstable-2025-08-15";

  pyproject = true;

  src = pkgs.fetchFromGitHub {
    owner = "oraios";
    repo = "serena";
    rev = "a066202d026a6ba66b04218ae4531cdc5c15681d";
    sha256 = "sha256-1XHMuoxgRN1XXi6zl01Q3MyjmcJ3OvtQKFgk2W2Jg/0=";
  };

  build-system = with pkgs.python3Packages; [
    hatchling
  ];

  dependencies = with pkgs.python3Packages; [
    requests
    pkgs.pyright
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

  optional-dependencies = with pkgs.python3Packages; {
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
  ];

  pythonRemoveDeps = [
    "dotenv"
    "pyright"
  ];

  postFixup = ''
    wrapProgram $out/bin/serena \
        --prefix PATH : "${lib.makeBinPath [ pkgs.pyright ]}"
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
