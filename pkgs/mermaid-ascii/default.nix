{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "mermaid-ascii";
  version = "1.4.0-unstable-2026-08-04";

  src = fetchFromGitHub {
    owner = "AlexanderGrooff";
    repo = "mermaid-ascii";
    rev = "56718655255cb4675e010c1089679cf06eac28a8";
    hash = "sha256-IPxXgE4Xq3tXfIjB5QXjM8tMjVv1XMSOxwVPj0OgYEI=";
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
