{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-14";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "7231e5a54bc76cdef63cebceb6fd3ac92b543896";
    hash = "sha256-7Poh8mk/61vAPCfCtjuAeEkYG23NXbEXzJu2QY5Y8wo=";
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
