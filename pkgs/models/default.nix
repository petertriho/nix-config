{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.2-unstable-2026-03-23";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "d51db4cc8018ed0903daa8cd5ae8c317c3a3908a";
    hash = "sha256-VqDgVz9bQUenkfrFlvXszmz0p4IO7fvXgamPi9MzZOI=";
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
