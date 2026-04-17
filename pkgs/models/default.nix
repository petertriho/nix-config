{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-17";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "2b8863b3bb94a1522be69d4e3a4c6d88c25e8381";
    hash = "sha256-6Mbmv7LktKtjI2qh3kCzeI6552ZguSwmgzFLyu797pE=";
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
