{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-16";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "6b99b726b8a7e0ae27bdc4e32c6c86cff2b9c6a9";
    hash = "sha256-AxUNMkY6vH6Tqc1fjOQCjWvLbeuf++fdKRKbJn+BXMA=";
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
