{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-21";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "cc5dcfff47cb1bae03af44fea1c9516e97f9c37e";
    hash = "sha256-jFahd0UlQ0tJ1tYHnnrpDKRYvIN6031+Hle9OvrQXVM=";
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
