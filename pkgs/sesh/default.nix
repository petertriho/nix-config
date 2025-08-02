{
  lib,
  fetchFromGitHub,
  buildGoModule,
  go-mockery,
  ...
}:
buildGoModule rec {
  pname = "sesh";
  version = "unstable-2025-07-03";

  nativeBuildInputs = [
    go-mockery
  ];
  src = fetchFromGitHub {
    owner = "joshmedeski";
    repo = "sesh";
    rev = "532518523873df01903688492dd1cecf3a97ac8e";
    sha256 = "13cizgjjqzbldh6vk1mx526dcfhqzr7mgf8y5qjsykkz0ka7lnx2";
  };

  preBuild = ''
    mockery
  '';
  vendorHash = "sha256-TLl8HZnsVvtx6jqusTETP0l3zTmzYmuV4NJIM958VcQ=";

  ldflags = [
    "-s"
    "-w"
  ];

  meta = {
    description = "Smart session manager for the terminal";
    homepage = "https://github.com/joshmedeski/sesh";
    changelog = "https://github.com/joshmedeski/sesh/releases/tag/${src.rev}";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [
      gwg313
    ];
    mainProgram = "sesh";
  };
}
