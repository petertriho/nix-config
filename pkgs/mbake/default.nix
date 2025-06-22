{
  python3Packages,
  fetchPypi,
  ...
}:
with python3Packages;
buildPythonApplication rec {
  pname = "mbake";
  version = "1.1.3";
  format = "pyproject";
  src = fetchPypi {
    inherit pname version;
    sha256 = "sha256-hc6KvDE9EVVkc/VfiTsGfGrdJCUOam1SfeTW3XNCOF0=";
  };
  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
