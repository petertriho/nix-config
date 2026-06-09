{
  lib,
  rustPlatform,
  fetchFromGitHub,
  perl,
}:

rustPlatform.buildRustPackage {
  pname = "tokscale";
  version = "3.1.0-unstable-2026-06-08";

  src = fetchFromGitHub {
    owner = "junhoyeo";
    repo = "tokscale";
    rev = "c21980739c56a3d430d7b6af6dccb2376b925b6b";
    hash = "sha256-2F9GAjVVbQn7iSi5Z89sIpd68SL+dYs1ddRZxc31LRk=";
  };

  cargoHash = "sha256-hSJjmLxbPBp8dT2J+L3gcwa1Esr4cl8YeJbses/HQRM=";

  nativeBuildInputs = [ perl ];

  cargoBuildFlags = [
    "-p"
    "tokscale-cli"
  ];

  doCheck = false;

  # Fix a single invalid UTF-8 byte in the vendored x11rb source produced by cargo vendor.
  prePatch = ''
    perl -0pi -e 's/try_into\250\)/try_into\(\)/g' \
      "$cargoDepsCopy/source-registry-0/x11rb-0.13.2/src/wrapper.rs"
  '';

  meta = {
    description = "CLI and TUI for AI token usage analytics";
    homepage = "https://github.com/junhoyeo/tokscale";
    license = lib.licenses.mit;
    mainProgram = "tokscale";
  };
}
