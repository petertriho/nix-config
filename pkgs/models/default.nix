{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-16";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "8e0805989bef241e5f28c2302bb44db501f917be";
    hash = "sha256-tnipkcZ6Tkaic8UlwkEETAnvXLwlDFQMeSSObf6SAUU=";
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
