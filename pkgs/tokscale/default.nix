{
  lib,
  rustPlatform,
  fetchFromGitHub,
  perl,
}:

rustPlatform.buildRustPackage {
  pname = "tokscale";
  version = "3.1.3-unstable-2026-06-18";

  src = fetchFromGitHub {
    owner = "junhoyeo";
    repo = "tokscale";
    rev = "cbbd0dffda93a3a4588fc08fd631ca10bba73ff1";
    hash = "sha256-1mxOG/JHjFaeowo8kvU9xCJmPJeXuwmnLrlZizlkMNY=";
  };

  cargoHash = "sha256-ZX7i9wAbqJwf8PW5EDRXvvFnrJQG0czVU7unCZadxLY=";

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
