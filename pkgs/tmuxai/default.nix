{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.2-unstable-2026-03-30";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "a8eccb29cb74da295a96b40ec502dc53e6f1e1ba";
    hash = "sha256-jhOGtGcqR3UnaCVjRzSE9rxnJzWORFywFBpgMbcfY/Q=";
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
