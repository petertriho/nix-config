{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-18";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "b4760c9d4ae575087a072e9a9aa28b050dce99b1";
    hash = "sha256-He3cdkU95vYieFl1NL4GZ1oD9AFtVF131jzxsZ1ErVs=";
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
