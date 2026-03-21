{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.5-unstable-2026-03-20";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "aed20dbb0c2fa7cb64c9a69f292956b185eaffe0";
    sha256 = "sha256-GwBbmzESIPg194DRZwLz38txfDxL645jz8SGPcxVpXY=";
  };

  vendorHash = "sha256-ycw67MzaJNw4TYoD1CyFGH1/qEQQDXPRdlWML88NzLw=";

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
