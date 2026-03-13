{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-13";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "cd66d00019c82e05972a60bde03f0a3a384c1aeb";
    hash = "sha256-XSFgpWB2VNZrMf7AoC5zzUq/y8SoQGHIjnZ+OQlOg4o=";
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
