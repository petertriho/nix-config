{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "mermaid-ascii";
  version = "1.6.1-unstable-2026-10-19";

  src = fetchFromGitHub {
    owner = "AlexanderGrooff";
    repo = "mermaid-ascii";
    rev = "5a9df1560871e1ef8037c052b3b5d87de503bc9e";
    hash = "sha256-uEESXvLyhi7UtZafEBF+gxK7rCbUqL7T6V2ZbRgcCZI=";
  };

  vendorHash = "sha256-S/K6W8KC6YzwZPioucoiwOMd29LPv0J22T3MS0X+W5g=";

  meta = with lib; {
    description = "Render Mermaid graphs inside your terminal";
    homepage = "https://github.com/AlexanderGrooff/mermaid-ascii";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "mermaid-ascii";
  };
}
