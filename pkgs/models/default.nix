{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-22";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "531d76d7e4b055524534b7a301eaac8db2d2105f";
    hash = "sha256-6bjwliEkb13CyMLEGzyE4AW8THNlOqYPgUqiX9WjiyM=";
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
