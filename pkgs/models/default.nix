{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-02";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "e06881993d0e0bb6ec79bb38ad3fda518f206f20";
    hash = "sha256-uW4nU+3GWGfkN53IqYyqj/51/qo9yyqyi9WwLXxc/0c=";
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
