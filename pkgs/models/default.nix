{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-10";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "a3d6d12f4ee5eeac5ea78d5e770a3c26b982e800";
    hash = "sha256-xbPffC0OatXaD2C8dr//x3UfUR5eA+BhBLZYUOIsIpU=";
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
