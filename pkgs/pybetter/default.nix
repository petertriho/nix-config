{
  python3Packages,
  fetchPypi,
  pyemojify,
  ...
}:
let
  removePythonLicense =
    # sh
    ''
      rm $out/lib/python*/site-packages/LICENSE
    '';
in
with python3Packages;
buildPythonApplication rec {
  pname = "pybetter";
  version = "0.4.1";
  format = "pyproject";
  src = fetchPypi {
    inherit pname version;
    sha256 = "sha256-tDHPGBSTVIWrHGnj0k8ezN5KTRDx2ty5yhFEkCtvnHk=";
  };
  postPatch = ''
    substituteInPlace pyproject.toml \
    --replace poetry.masonry.api poetry.core.masonry.api \
    --replace "poetry>=" "poetry-core>="
  '';
  postFixup = removePythonLicense;

  doCheck = false;
  dontCheckRuntimeDeps = true;
  nativeBuildInputs = [ poetry-core ];
  propagatedBuildInputs = [
    click
    libcst
    pyemojify
    pygments
  ];
}
