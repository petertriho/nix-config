{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-05-04";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "33fd9bd526ed837b23f91342515fc481735ca96f";
    hash = "sha256-vr1ugViCvuq0jkxaBOTI6eGaCA3NYvfopZxk0nN2Q64=";
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
