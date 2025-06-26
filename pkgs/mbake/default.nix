{
  python3Packages,
  fetchFromGitHub,
  ...
}:
with python3Packages;
buildPythonApplication {
  pname = "mbake";
  version = "unstable-2025-06-25";
  format = "pyproject";

  src = fetchFromGitHub {
    owner = "EbodShojaei";
    repo = "bake";
    rev = "14ea4bd03f584778a0dd511d54e3df09f92e927a";
    sha256 = "0fni1qnz2z2mdgqf5qwh4lhwrhw5m38ahabqk9vsyqp55lf3fcs7";
  };

  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
