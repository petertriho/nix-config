{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.2-unstable-2026-03-31";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "258d43b910cbfef3367faa97e7f67c7147045ffd";
    hash = "sha256-g9Hx7tyS+4HcxAxf8js4Gkce8OhQdOW93dyMrpuPV74=";
  };

  vendorHash = "sha256-a4oJpATucba35MN+DY+sxDEAc4QaC3T1LGIgIvCC3QU=";

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
