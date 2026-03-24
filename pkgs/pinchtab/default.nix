{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.5-unstable-2026-03-23";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "e04d166f34e53a09e9e1028b1fc68151231dd7d3";
    sha256 = "sha256-Lo/BXz7IIkgqcH7/802JIBwPpXzuuwkBUgTi/uAS844=";
  };

  vendorHash = "sha256-xhfAxrm5neGVHf+yPF5osmMcspAPbT4kXpJ/0S4+l7k=";

  subPackages = [ "cmd/pinchtab" ];

  ldflags = [
    "-s"
    "-w"
    "-X main.version=${version}"
  ];

  postInstall = ''
    mkdir -p $out/share/pinchtab
    cp -r skills $out/share/pinchtab/
  '';

  meta = with lib; {
    description = "Browser automation bridge and multi-instance orchestrator";
    homepage = "https://github.com/pinchtab/pinchtab";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "pinchtab";
  };
}
