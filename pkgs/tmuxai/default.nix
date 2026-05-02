{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.4-unstable-2026-05-01";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "8ef4656e2e4285c98db3346a0ad8933980bf31fd";
    hash = "sha256-OHzllPMZcojNtx/l2cPH9Ou+cQkmYnIvXJXGQ0EiV5k=";
  };

  vendorHash = "sha256-zkOFpYDgwLLbDL2eCBrYkySzalmBPo/gLzZQRbC+s70=";

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
