{
  python3Packages,
  fetchFromGitHub,
  ...
}:
with python3Packages;
buildPythonApplication {
  pname = "mbake";
  version = "unstable-2025-07-11";
  format = "pyproject";

  src = fetchFromGitHub {
    owner = "EbodShojaei";
    repo = "bake";
    rev = "f4b1c9f2424e3175b49771e05d2ea224c70f9db1";
    sha256 = "14c9m0ghy0n8ml32fw798kwb8yf8lk5m2j4wmcli8hd4r8a4rxdd";
  };

  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
