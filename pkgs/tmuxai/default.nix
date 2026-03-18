{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.1-unstable-2026-03-18";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "7770f156e3609079c98712d478ec627fe5940a03";
    hash = "sha256-eAauLivhbqi5kwsugEPu4pWS81Dtt9oz5Bg98EqFPbI=";
  };

  vendorHash = "sha256-rXvsEbSOi8kXgP5oL3FxyFSXpyIYMLuQTaRLkEmscqk=";

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
