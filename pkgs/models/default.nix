{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-10";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "91c515c0042abb079a5610accfc3c31d5073c3ba";
    hash = "sha256-EnX4xURy2zAMb4AU0eByrehYpR6ZOiO1PBQ24Dp05dM=";
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
