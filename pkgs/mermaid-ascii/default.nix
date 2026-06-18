{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "mermaid-ascii";
  version = "1.2.0-unstable-2026-06-17";

  src = fetchFromGitHub {
    owner = "AlexanderGrooff";
    repo = "mermaid-ascii";
    rev = "876b5b44fcebb746e7aee09d3d19d0c059452621";
    hash = "sha256-41gznhgKFp5WSB3s0edt49aNNEcth4fmECgH68rMO+M=";
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
