{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0-unstable-2026-05-13";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "ed02109aa0bd4100a88f802753e08b3f2a204e41";
    hash = "sha256-ZRIUl+Dty5Qs0OyANj1sOZXKKdIQbtg+lAdWeUobRLI=";
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
