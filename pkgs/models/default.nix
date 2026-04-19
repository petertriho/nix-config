{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-19";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "e5072a9d280014546fbf2482af373797d8719d6f";
    hash = "sha256-/PWx0qSnFRAoNSDYv4EctsqiZRI3JyNkm+ZIYNMISVk=";
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
