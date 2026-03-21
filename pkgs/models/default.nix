{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.1-unstable-2026-03-21";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "bfab06e6a5eb6b8a7c0ab049cc9bdb712bf4523a";
    hash = "sha256-vh3PZnBi4J86OZ8ttuGANLVts79hBsR+JxdY31Vkxno=";
  };

  cargoHash = "sha256-VkMj64SHtYZTP8l+Qu1J47iSgh9Ib0dULcIs7AQW52Q=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
