{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.2-unstable-2026-03-21";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "8b547179c14f7883bcbaff1a2579aec9c872c716";
    hash = "sha256-hCpJpAAiXOgEz1XrZ+9z83GLik7Jk5kkyZ2zflEVAWs=";
  };

  cargoHash = "sha256-L+SzBbJ3m6OKB5IYxswp5d4hMi2z3oVNCKo0MWdUp4s=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
