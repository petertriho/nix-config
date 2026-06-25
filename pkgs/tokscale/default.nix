{
  lib,
  rustPlatform,
  fetchFromGitHub,
  perl,
}:

rustPlatform.buildRustPackage {
  pname = "tokscale";
  version = "4.0.2-unstable-2026-06-24";

  src = fetchFromGitHub {
    owner = "junhoyeo";
    repo = "tokscale";
    rev = "7c1c7ba3124c07b89c5936e41d9361bbf706650c";
    hash = "sha256-iX5X9T5Kc51VnQF1+vBXXXivcYID7ErF5ZSfj31zNv4=";
  };

  cargoHash = "sha256-qwNT66/H1FI/XIRndmccYI4cx9DOQUIODuOdWqzY0io=";

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
