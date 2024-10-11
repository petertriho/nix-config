{
  python3Packages,
  fetchPypi,
}:
with python3Packages;
buildPythonApplication rec {
  pname = "ssort";
  version = "0.13.0";
  format = "pyproject";
  src = fetchPypi {
    inherit pname version;
    sha256 = "sha256-p7NedyX6k7xr2Cg563AIPPMb1YVFNXU0KI2Yikr47E0=";
  };
  doCheck = false;
  nativeBuildInputs = [ setuptools ];
  propagatedBuildInputs = [ pathspec ];
}
