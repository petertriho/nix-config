{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-20";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "b23393a1526058ac64813beb0ae3af198884066b";
    hash = "sha256-V19CtYP1/FMxQ9L1v/LxmPr8OFHcBPZ+9FEbOEoedFA=";
  };

  cargoHash = "sha256-2rM8AueVDyZj04IvxIEZIGZMBuSS9ahVrcxpOZZddy0=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
