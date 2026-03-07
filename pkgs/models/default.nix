{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.9.7-unstable-2026-03-07";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "bd665dc4a0af764a28a6faf1b905cbad329357fc";
    hash = "sha256-5j4i+nim1YwshzDiZh0g+UVDo20Se9zT3aEi+VCSTAo=";
  };

  cargoHash = "sha256-XMaGuKv9ippmnqt/l8B/xb+Q7YytGpgitXAqur/i6MU=";

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
