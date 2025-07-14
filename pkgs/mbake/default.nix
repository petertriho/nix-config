{
  python3Packages,
  fetchFromGitHub,
  ...
}:
with python3Packages;
buildPythonApplication {
  pname = "mbake";
  version = "unstable-2025-07-13";
  format = "pyproject";

  src = fetchFromGitHub {
    owner = "EbodShojaei";
    repo = "bake";
    rev = "0c0effaeff172aa00a79e25d6ad49c675ff29be1";
    sha256 = "00myagdbsciwx102q8jysy16c6h7xmjcdffhfbm78791a1icz6yb";
  };

  build-system = [
    hatchling
  ];
  dependencies = [
    rich
    typer
  ];
}
