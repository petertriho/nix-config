{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.9.7-unstable-2026-03-08";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "f5e6941da59156a83d864e57ca53de9974957da0";
    hash = "sha256-VLZEklj9382vn+M71EJyKdeViZxK5ib0ajw6aZIgGwE=";
  };

  cargoHash = "sha256-XMaGuKv9ippmnqt/l8B/xb+Q7YytGpgitXAqur/i6MU=";

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
