{
  lib,
  rustPlatform,
  fetchFromGitHub,
  pkg-config,
  openssl,
}:

rustPlatform.buildRustPackage {
  pname = "sem";
  version = "0.22.1-unstable-2026-08-16";

  src = fetchFromGitHub {
    owner = "Ataraxy-Labs";
    repo = "sem";
    rev = "ba2dfbbe75836cfe6f69dc036c9060b7ce5cc158";
    hash = "sha256-MaISe6TG4I5zb6hSRsBj5ENe5JSh7MjQ+QIDWDhxTo0=";
  };

  sourceRoot = "source/crates";

  cargoHash = "sha256-/ZxkR3YmUgswxuTCQHoGyoDhuU3JeDbrjPsTSLf9WKc=";

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
