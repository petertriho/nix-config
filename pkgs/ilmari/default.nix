{
  rustPlatform,
  fetchFromGitHub,
  lib,
}:
rustPlatform.buildRustPackage {
  pname = "ilmari";
  version = "0.1.5-unstable-2026-04-10";

  src = fetchFromGitHub {
    owner = "bnomei";
    repo = "ilmari";
    rev = "e3f2254bdfe6ea8a20bfecfbc7d0e6866c74397f";
    hash = "sha256-EhlDIsKo4kioaRcMnSe+zt5TYuSSrzdUGCBg8rvm+x0=";
  };

  cargoHash = "sha256-bcyu9Wo6MYRUiCd0D78KEyVAoCHqgYforCx7hQ98HGM=";

  doCheck = false;

  meta = {
    description = "Minimal tmux popup radar for AI coding agents";
    homepage = "https://github.com/bnomei/ilmari";
    license = lib.licenses.mit;
    mainProgram = "ilmari";
  };
}
