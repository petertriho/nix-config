{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-04-28";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "234d06fcfb346294fac3f5999fd9fbc31e8b6f00";
    hash = "sha256-gh84Bsw46lhPluX4nrkacPhMtzR2lDr0Eds1rUlAOpc=";
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
