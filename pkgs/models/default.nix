{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-06";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "745367599e22b761bafce413dbb3811196eef600";
    hash = "sha256-HaDOa4ONjAX8HxlxbvDOyG8QeUDYkiBPgjqlxR9Di3w=";
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
