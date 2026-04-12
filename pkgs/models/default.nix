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
    rev = "12adc17ccea770e0acbaddbe5da838e395471348";
    hash = "sha256-FWcLYXDWWIve15zRLsmq+jrohsUcpcBIuwMB3yp1ZPc=";
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
