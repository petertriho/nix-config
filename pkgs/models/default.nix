{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-07";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "de894c2ad198f3e9687ad1f850376396fae9fd42";
    hash = "sha256-L6Lbq5YBA9tlxjAgRzJl4STG25V//OUcFiieUVG8V7o=";
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
