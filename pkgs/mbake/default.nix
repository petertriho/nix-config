{
  python3Packages,
  fetchPypi,
  ...
}:
with python3Packages;
buildPythonApplication rec {
  pname = "mbake";
  version = "1.2.1";
  format = "pyproject";
  src = fetchPypi {
    inherit pname version;
    sha256 = "sha256-ssXJwUPRM57xBPaxvfNrOq1xsNL7qkGYzsSgtUflWT4=";
  };
  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
