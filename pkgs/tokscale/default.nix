{
  lib,
  rustPlatform,
  fetchFromGitHub,
  perl,
}:

rustPlatform.buildRustPackage {
  pname = "tokscale";
  version = "0-unstable-2026-05-27";

  src = fetchFromGitHub {
    owner = "junhoyeo";
    repo = "tokscale";
    rev = "ef17c25996117912fb7fc2967de41ac962e0d156";
    hash = "sha256-iF6wDZsmGTK69B4dAIYrvTVWd191nAGSOwviugxx2Qc=";
  };

  cargoHash = "sha256-McaxzhU2xEdEz9GQTFnUv1l68crBtVpoSlsdsrjuCvI=";

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
