{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.10.2-unstable-2026-03-10";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "850300c5d359ac0e10065b7bcda0e3a6d9c166d1";
    hash = "sha256-L5+xq5opr9b2IDDLNbhDmRm0kZaii41ymRfm0GMp+28=";
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
