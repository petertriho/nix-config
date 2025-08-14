# https://github.com/nixvital/ml-pkgs/blob/main/gen-ai/serena/default.nix
{
  lib,
  pkgs,
}:
let
  pname = "serena-agent";
  version = "unstable-2025-08-14";
in
pkgs.python3Packages.buildPythonPackage {
  inherit pname version;
  pyproject = true;

  src = pkgs.fetchFromGitHub {
    owner = "oraios";
    repo = "serena";
    rev = "de173ce0780fdd8342781b8dac2a6ab671cb922a";
    sha256 = "10g359h2xg8fax6g6x6yd1lrgcv4si1w0g6y8sfl1zq0ls1y84p3";
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
    maintainers = with maintainers; [ breakds ];
  };
}
