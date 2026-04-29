{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.2-unstable-2026-04-28";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "7f7d91babe6580c75976f61fb2aec1fe6e5a35ad";
    hash = "sha256-lE5gZxDwasNg2JDPbEsMmiNpvXO+di8AjxAUlLRtPxw=";
  };

  vendorHash = "sha256-d1MRJNvc7Hw8Kk2OWH8YCuIL1wTFFGAaYxx85CWsZk8=";

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
