{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-18";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "e6e57f2c7e4151e147b51b71815ea98c562eb4f2";
    hash = "sha256-JfLQh5ii5AjT1onfjA/KxAHr5H/65nvOEbx3rA+QTt0=";
  };

  cargoHash = "sha256-2rM8AueVDyZj04IvxIEZIGZMBuSS9ahVrcxpOZZddy0=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
