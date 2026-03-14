{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-14";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "7739cb489cebfdeefec4f2ca9704da0cef88e64e";
    hash = "sha256-/OBOARKAQr7Ot+HqnmvKdVmsWU3BaP5cWcJaGrqfgLI=";
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
