{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-05-03";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "00229327c68b8afb40a1c6c600835e90aa6b20da";
    hash = "sha256-V4uj9CcWiVuYolqJuuIDSITqROhOjzqDPrT1uSjX35A=";
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
