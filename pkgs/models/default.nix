{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-17";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "ab850421fb650144b7e47cc55f5bd4519fbde54e";
    hash = "sha256-5Rv9p8O2vAtuNnMIBk6E4GOp3l9ivtMc3uJFXvvf+L4=";
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
