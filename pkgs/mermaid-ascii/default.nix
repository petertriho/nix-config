{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "mermaid-ascii";
  version = "1.5.0-unstable-2026-08-07";

  src = fetchFromGitHub {
    owner = "AlexanderGrooff";
    repo = "mermaid-ascii";
    rev = "b1b35f67d6a5dd0699ccfc968c00a763db573076";
    hash = "sha256-D+ZU/J45pBqOkHWfMhWhXLZzU/Ufq/1zfz3sxqdiAGk=";
  };

  vendorHash = "sha256-aB9sbTtlHbptM2995jizGFtSmEIg3i8zWkXz1zzbIek=";

  meta = with lib; {
    description = "Render Mermaid graphs inside your terminal";
    homepage = "https://github.com/AlexanderGrooff/mermaid-ascii";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "mermaid-ascii";
  };
}
