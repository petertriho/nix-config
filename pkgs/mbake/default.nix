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
    rev = "5c82db7b191444ebcfc98a3952db4ca9e38d13bf";
    sha256 = "103q1s88krzg61zjnqin3ys98c3c0iyvypbjg5yb5rfg74dip21v";
  };

  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
