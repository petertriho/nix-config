{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.5-unstable-2026-03-24";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "da0e0a2ce6dfbbd4f363aafb7153bbf92c6e6264";
    sha256 = "sha256-oDZB+difPx5+et24HN4Gos+R1WfUvHn/Fw85wqdVakQ=";
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
