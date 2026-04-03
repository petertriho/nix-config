{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-03";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "1d522753665b633a91a2990bbf15f608bd025b7a";
    hash = "sha256-HW423KBJqPGKyHZNUXx6nqfvKOWPQ4jpwglC1EDB1mA=";
  };

  cargoHash = "sha256-qAomuqDkcj/t4LVaRGIeX1+j6MEgv1rSH3JtCTHm2As=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
