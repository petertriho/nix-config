{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "ilmari";
  version = "0.1.4-unstable-2026-03-20";

  src = fetchFromGitHub {
    owner = "bnomei";
    repo = "ilmari";
    rev = "95c344da2feba08676e5202d0e9f43986b0888e0";
    hash = "sha256-rQPbgm/mrhOuEo2nXXSGbf/uwPSsArankMULpfIZN34=";
  };

  cargoHash = "sha256-vBP6SV5vj6LJABqkYk8FnlNpAdANvwKsWpxnLVf3pM8=";

  doCheck = false;

  meta = {
    description = "Minimal tmux popup radar for AI coding agents";
    homepage = "https://github.com/bnomei/ilmari";
    license = lib.licenses.mit;
    mainProgram = "ilmari";
  };
}
