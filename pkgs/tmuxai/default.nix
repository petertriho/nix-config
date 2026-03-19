{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.2-unstable-2026-03-18";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "f015c0eeab2a5f4bda255cb3ed19314b4cbb94bc";
    hash = "sha256-fHssAR2YOhNEEkSStFmy5SnGccHtU8JREwXsy+yISG8=";
  };

  vendorHash = "sha256-tdJZ72IHMlVJmIn1YEUsx8UN+zL9pYl0s9mQ8JebDJY=";

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
