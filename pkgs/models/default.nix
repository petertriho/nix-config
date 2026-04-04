{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-03";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "a5799ca7b935e671683302a7de4f9e2351a8bb74";
    hash = "sha256-IpUe1Kuho7am4m/GIxfILZrmSEjDMoS3T6L2bwVXSwI=";
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
