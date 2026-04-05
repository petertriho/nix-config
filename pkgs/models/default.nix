{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "models";
  version = "0.11.4-unstable-2026-04-05";

  src = fetchFromGitHub {
    owner = "arimxyer";
    repo = "models";
    rev = "c5338de21a042d02cf047adc20fbe9ed5f19bb9e";
    hash = "sha256-Gpg11YLVICKd2+yTJgv7rWXmVLxGL0pEFKiuu8GIcpg=";
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
