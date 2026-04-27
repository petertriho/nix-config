{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-04-27";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "7c9cd2f612b627341349666062ecbfe30739d314";
    hash = "sha256-GWyBVPyuqrIY9U4+Wg69H6CsLtXXh5evAGeWg+adQSQ=";
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
