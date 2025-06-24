{
  python3Packages,
  fetchFromGitHub,
  ...
}:
with python3Packages;
buildPythonApplication {
  pname = "mbake";
  version = "unstable-2025-06-23";
  format = "pyproject";

  src = fetchFromGitHub {
    owner = "EbodShojaei";
    repo = "bake";
    rev = "766d59ed4bfa14a600bc19e064277c7883b84d27";
    sha256 = "14gmaphpafk9f4rf2jvppbylkwhga8gvp5v8pzxwyqk9wwvbyhmy";
  };

  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
