{
  python3Packages,
  fetchFromGitHub,
  ...
}:
with python3Packages;
buildPythonApplication {
  pname = "mbake";
  version = "1.3.1-unstable-2025-08-15";
  format = "pyproject";

  src = fetchFromGitHub {
    owner = "EbodShojaei";
    repo = "bake";
    rev = "8891b7429f61c6482a8947e389de3811fd37c2fa";
    sha256 = "sha256-L3Gpl3olNAux3IzQT7VlKLALpepJPMO5XdTgLasT90k=";
  };

  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
