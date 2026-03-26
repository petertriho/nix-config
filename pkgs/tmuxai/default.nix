{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.2-unstable-2026-03-26";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "37b8277a86b04f818da1c1bb1aabe836990eb859";
    hash = "sha256-Urh2rK3bap/jdRA/5X4wGk66irBHYgtlcwhAy0ALX7Y=";
  };

  vendorHash = "sha256-jdjIhYwW61XPkuxIwM3jqOqfusQzZfzURZWCJm0NVLo=";

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
