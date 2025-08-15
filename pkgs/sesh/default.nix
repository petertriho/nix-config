{
  lib,
  fetchFromGitHub,
  buildGoModule,
  go-mockery,
  ...
}:
buildGoModule rec {
  pname = "sesh";
  version = "2.17.1-unstable-2025-08-05";

  nativeBuildInputs = [
    go-mockery
  ];
  src = fetchFromGitHub {
    owner = "joshmedeski";
    repo = "sesh";
    rev = "185ee2a50b9b040e10718cb1c6389d05c3b81081";
    sha256 = "01lf79z9a7q0nw2224ddipb7lhgrghh99q92b3nbb1fxl6i9sg8k";
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
