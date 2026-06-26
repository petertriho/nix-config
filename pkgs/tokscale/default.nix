{
  lib,
  rustPlatform,
  fetchFromGitHub,
  perl,
}:

rustPlatform.buildRustPackage {
  pname = "tokscale";
  version = "4.0.4-unstable-2026-06-25";

  src = fetchFromGitHub {
    owner = "junhoyeo";
    repo = "tokscale";
    rev = "39cb8e23ca864ebd8af5a18126dc6832a8c77def";
    hash = "sha256-vFBIq7z0+bmMk2teDORrUVWrv7N3w1CsDrT2s85k6/U=";
  };

  cargoHash = "sha256-iXHriY+Kyn5pSx3uwouH2rkMBXkJX6zH5/xiFeCMqbQ=";

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
