{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-01";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "c7dde573785b0f163aa3f8adee9e2a3de79b7e0a";
    hash = "sha256-5pOVBW5h4kOsI9HOQxr0mD2r6pWsOPcL36Tcbzc5KWc=";
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
