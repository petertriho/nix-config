{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-14";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "948788c7824e1b237fe1ea17ddab571672c7007b";
    hash = "sha256-r4qaaCHaIZM3uaOJM1otk1GnrDYm2s6GVOR//8ZCG5M=";
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
