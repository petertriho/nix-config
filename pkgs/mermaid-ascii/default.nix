{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "mermaid-ascii";
  version = "1.6.2-unstable-2026-11-17";

  src = fetchFromGitHub {
    owner = "AlexanderGrooff";
    repo = "mermaid-ascii";
    rev = "e7a2d2f81cdb71e7db47db63f8317dd2aba86284";
    hash = "sha256-yZVQoQ9ynCIgHxRuG4FagdWkOtuxkRcF3/1NaMvQzvo=";
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
