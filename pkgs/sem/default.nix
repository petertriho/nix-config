{
  lib,
  rustPlatform,
  fetchFromGitHub,
  pkg-config,
  openssl,
}:

rustPlatform.buildRustPackage {
  pname = "sem";
  version = "0.21.1-unstable-2026-08-13";

  src = fetchFromGitHub {
    owner = "Ataraxy-Labs";
    repo = "sem";
    rev = "47fcc4b5c18d4d8ef310bc5c1cc4c0ba0e2b6e7d";
    hash = "sha256-rzWV9QuZbHupRqVK7hGL6fsh8KQELkc8bvfQWoIfTrs=";
  };

  sourceRoot = "source/crates";

  cargoHash = "sha256-0B947V49LLT3oZDXtYJFarDvZrynrE3PV9X4pTqc7z4=";

  nativeBuildInputs = [ pkg-config ];

  buildInputs = [ openssl ];

  cargoBuildFlags = [
    "--package"
    "sem-cli"
    "--no-default-features"
  ];

  doCheck = false;

  meta = with lib; {
    description = "Semantic version control CLI";
    homepage = "https://github.com/Ataraxy-Labs/sem";
    license = with licenses; [
      mit
      asl20
    ];
    mainProgram = "sem";
    platforms = platforms.unix;
  };
}
