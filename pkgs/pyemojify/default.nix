{
  python3Packages,
  fetchPypi,
}:
with python3Packages;
buildPythonPackage rec {
  pname = "pyemojify";
  version = "0.2.0";
  src = fetchPypi {
    inherit pname version;
    sha256 = "sha256-a7w8jVLj3z5AObwMrTYW0+tXm0xuFaEb1eDvDVeVlqk=";
  };
  propagatedBuildInputs = [ click ];
  doCheck = false;
}
