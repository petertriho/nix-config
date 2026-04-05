{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-05";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "3b432f2a38e5320ac39ed6624bf1a5cd6380054d";
    hash = "sha256-2P0Q8wXJ5yJHDfnVYkemQQ1VXi5+d2FXmfnzqJdqstw=";
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
