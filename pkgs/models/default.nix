{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-12";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "426571380566881aa480bcfd9e8a0ceea0a7112a";
    hash = "sha256-EwxM42hRebmzOQ7gxs/nIg+s2SDriz9bi0Ae4wDQqjA=";
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
