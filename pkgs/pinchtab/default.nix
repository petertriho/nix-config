{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.5-unstable-2026-03-25";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "a339822f52d61657ea26652dff23e4218355b51b";
    sha256 = "sha256-0Rzgp4X9b4CUDiCwN1NKTgETfuIX14GobZDeYtwQSlk=";
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
