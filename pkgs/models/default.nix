{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage rec {
  pname = "models";
  version = "0.11.4-unstable-2026-04-30";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "90b3dc76bbd3316a1d439cf7bb67a8a2a6526ce7";
    hash = "sha256-xC5+PTEKrXklsQ0zzwbRQSX5eGh1gplQXikQY2bmCjg=";
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
