{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-04-25";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "0f19fb47f3329aad0db697da76640069ae4b4e05";
    hash = "sha256-3Tppnd3dpQlWJ3smaQYjdZA/WIJyuyA6C3k5hGXZlkU=";
  };

  cargoLock.lockFileContents = builtins.readFile "${src}/Cargo.lock";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
