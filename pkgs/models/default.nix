{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-03";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "ed1ff6b9273cdf7d9ea7ca72c64a26310ab7cc14";
    hash = "sha256-ZSQBHM2DBEvtG+P02SAmKXSWJDFL7R2fGwmcu047tS8=";
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
