{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-19";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "9be3a43e80df30b5caec866f07f3f25e5fe48207";
    hash = "sha256-LKCHK+hKSqh7dNsEIShwUDI+DdXoZ1F9gDsB+zDYzKc=";
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
