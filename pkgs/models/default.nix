{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-09";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "41251cd2f0a6c52ef48ffc33041cefa377c814b1";
    hash = "sha256-himMhXDPLCULzPkUg0RB/i8wjg0RUCLqWoldscdSStw=";
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
