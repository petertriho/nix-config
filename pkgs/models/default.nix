{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-11";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "ce9aec701faae2f3bd6587c8319bef52f768c72a";
    hash = "sha256-aTK8cYKr7EBRd5yMBLW6xAtLKRunl4zIva5u9wfUe28=";
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
