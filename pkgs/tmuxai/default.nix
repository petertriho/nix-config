{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "0-unstable-2026-05-05";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "64c69f9e47a82b860b40989c029a5bb781a31e1c";
    hash = "sha256-UaAvdvQTqjGQ5NM0AuBkUQ64M+EAuy55mB73uktQ/wc=";
  };

  vendorHash = "sha256-/fp4LR9QLN7mE9Ba7BfStEnrOFdvau5EX3rKxyinJX0=";

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
