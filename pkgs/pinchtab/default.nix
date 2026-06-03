{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.13.2-unstable-2026-05-31";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "470ab47728ec47cae7d0f0c33af8ef8e159ba9e8";
    sha256 = "sha256-Qpn7cDCDFRqJ7RyosM5AjhdDlDQp9RCbzFPbiE8qUfw=";
  };

  vendorHash = "sha256-CM0ou/CyIhIrDgPIdb9TVatZuRx7IiQP0Vqys9C/CZ8=";

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
