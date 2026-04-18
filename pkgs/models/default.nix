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
    rev = "54b6f03ff1b0610f4d1b7aea575201622b81a224";
    hash = "sha256-M7qzagDgQTQMsGrfbm8jBEHW5bJNZYZN1flBjaA/1CQ=";
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
