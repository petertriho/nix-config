{
  lib,
  fetchFromGitHub,
  python3Packages,
}:
python3Packages.buildPythonApplication {
  pname = "postgres-mcp";
  version = "0.3.0-unstable-2025-05-16";

  src = fetchFromGitHub {
    owner = "crystaldba";
    repo = "postgres-mcp";
    rev = "7179ab0336396f819e23b0b012a9c284be10fac3";
    sha256 = "sha256-VCU7qVPbYyBBkLwtmNf+I0XxGzY4Qd7JFHEwbI8eU+I=";
  };

  pyproject = true;

  build-system = [ python3Packages.hatchling ];

  dependencies = with python3Packages; [
    attrs
    humanize
    instructor
    mcp
    pglast
    psycopg
    psycopg-pool
  ];

  doCheck = false;

  pythonImportsCheck = [ "postgres_mcp" ];

  pythonRelaxDeps = [
    "pglast"
  ];

  meta = {
    description = "PostgreSQL Tuning and Analysis Tool with MCP server support";
    homepage = "https://github.com/crystaldba/postgres-mcp";
    license = lib.licenses.mit;
    mainProgram = "postgres-mcp";
  };
}
