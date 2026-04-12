{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-12";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "e83e8c0c3182379501eb00ffa46db80f479d2676";
    hash = "sha256-KfbZvw2I52a9lzZCmsQztLdLy6KUhthxrcZR/LweCs0=";
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
