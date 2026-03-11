{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-11";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "a7cbad7b0ee64394628ec864b2d231e9af680d25";
    hash = "sha256-v7M6AALdgaxl2xXGYD3G/A4+vBRJkov3GL5/uum54u4=";
  };

  cargoHash = "sha256-b2QlNecTvV09t7qEx0R8MuuqlCmXMra2bPDK/JPLO3o=";

  doCheck = false;

  meta = {
    description = "CLI and TUI for browsing AI models and tracking coding agents";
    homepage = "https://github.com/arimxyer/models";
    license = lib.licenses.mit;
    mainProgram = "models";
  };
}
