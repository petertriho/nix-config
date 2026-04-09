{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.2-unstable-2026-04-08";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "156902dd6fc66dfa89a91b22893a82f43723817d";
    hash = "sha256-qtjrzGkd8nTu/gtyTNsARG63pQpZQVnzwtOrksIk3XA=";
  };

  vendorHash = "sha256-IVnbARqG71J3nVfWywvY8q2Kd24CBdPN6YewXnoqQi4=";

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
