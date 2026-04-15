{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-15";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "b775bd5ec95702a6ae798caf6f2331c967d3c010";
    hash = "sha256-Dwzuu7DT/LNw0TrIc1rUxR/skeLptv5btYTi3BjzhRQ=";
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
