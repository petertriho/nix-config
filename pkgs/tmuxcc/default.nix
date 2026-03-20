{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "tmuxcc";
  version = "0.1.7-unstable-2026-03-20";

  src = fetchFromGitHub {
    owner = "nyanko3141592";
    repo = "tmuxcc";
    rev = "5a00dbcb10a1f09e819849013c6bb87d71df7127";
    hash = "sha256-alxVP3zuK2YXEDBvrGk0CSDLj6XlGwoHoQ/aS7yRO5o=";
  };

  cargoHash = "sha256-84zvJDvhFdVbvBw+5JhM5TPdENYPyjt/n+wkw6jfyz4=";

  meta = {
    description = "TUI dashboard for managing AI coding agents in tmux";
    homepage = "https://github.com/nyanko3141592/tmuxcc";
    license = lib.licenses.mit;
    mainProgram = "tmuxcc";
  };
}
