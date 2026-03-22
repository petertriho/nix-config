{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.2-unstable-2026-03-22";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "d73aab76a0a1b961ca54e4c5198086826d50f9e5";
    hash = "sha256-VfVfKIfOzW16BVo6UcALQ/DnFnKAQlM7g3uOG/Pf3V4=";
  };

  cargoHash = "sha256-L+SzBbJ3m6OKB5IYxswp5d4hMi2z3oVNCKo0MWdUp4s=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
