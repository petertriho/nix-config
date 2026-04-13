{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-13";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "f9e23b861571e8a9e1afec1d2a120e10fb340897";
    hash = "sha256-z4VMwxZeLnye8TJMZW8dF9gvmIaqFn4a0S8W8SGbBrg=";
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
