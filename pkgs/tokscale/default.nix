{
  lib,
  rustPlatform,
  fetchFromGitHub,
  perl,
}:

rustPlatform.buildRustPackage {
  pname = "tokscale";
  version = "2.1.3-unstable-2026-05-24";

  src = fetchFromGitHub {
    owner = "junhoyeo";
    repo = "tokscale";
    rev = "58acc0204f9075a5bc35852434caa8355820c787";
    hash = "sha256-A3jyajKnXKaBYH3wbMmIJeXs8k06KNeMttjio8bnhKk=";
  };

  cargoHash = "sha256-1MsRjuyvSxLo8dFK3yH5i+jeeKFBVGX/4excFYImBc4=";

  nativeBuildInputs = [ perl ];

  cargoBuildFlags = [
    "-p"
    "tokscale-cli"
  ];

  # Skip integration tests that require network pricing data or host timezone state.
  cargoTestFlags = [
    "-p"
    "tokscale-cli"
    "--"
    "--skip"
    "test_graph_single_day_filter_uses_local_timezone_boundaries"
    "--skip"
    "test_pricing_command_json"
    "--skip"
    "test_pricing_command_success"
    "--skip"
    "test_pricing_command_with_provider"
  ];

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
