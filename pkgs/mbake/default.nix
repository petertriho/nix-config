{
  python3Packages,
  fetchFromGitHub,
  ...
}:
with python3Packages;
buildPythonApplication {
  pname = "mbake";
  version = "unstable-2025-06-24";
  format = "pyproject";

  src = fetchFromGitHub {
    owner = "EbodShojaei";
    repo = "bake";
    rev = "349b01464cff355bdf2ed82ba355ff1eede94b3a";
    sha256 = "17jyxvbmbj9scy05jb8dg2wb71wj214zjzs8z968pa5pqcfl32fi";
  };

  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
