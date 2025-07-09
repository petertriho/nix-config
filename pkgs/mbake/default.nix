{
  python3Packages,
  fetchFromGitHub,
  ...
}:
with python3Packages;
buildPythonApplication {
  pname = "mbake";
  version = "unstable-2025-07-08";
  format = "pyproject";

  src = fetchFromGitHub {
    owner = "EbodShojaei";
    repo = "bake";
    rev = "d401e2b1d3a08cb1c917e41e569eb9a18a06d10e";
    sha256 = "0bvk9h86f98sm7n0v3jaddgig88drpl45rgrkm5bagsdcc7x807r";
  };

  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
