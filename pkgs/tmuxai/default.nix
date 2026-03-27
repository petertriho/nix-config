{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.2-unstable-2026-03-27";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "7675c33b91b8609d1a80f9c43a1723161d582085";
    hash = "sha256-Ythu2LR2fZRy17L5Am2mKeagFlGPqDTR37w/BP36XVU=";
  };

  vendorHash = "sha256-Gpx5AO61VBlRYijWDC1w6CQzjjCl5X766uppvr30mmQ=";

  ldflags = [
    "-s"
    "-w"
  ];

  meta = with lib; {
    description = "AI-Powered, Non-Intrusive Terminal Assistant for tmux";
    homepage = "https://github.com/alvinunreal/tmuxai";
    license = licenses.asl20;
    maintainers = [ ];
    mainProgram = "tmuxai";
  };
}
