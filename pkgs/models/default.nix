{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-20";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "724d2c6d2320d927da9cbaae75f01587a02ce5d1";
    hash = "sha256-jEV/gkQLkqvSS5al1Ug7+ficxzMkh5pqD+1aMaOwSW8=";
  };

  cargoHash = "sha256-qAomuqDkcj/t4LVaRGIeX1+j6MEgv1rSH3JtCTHm2As=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
