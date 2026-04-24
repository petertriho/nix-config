{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.10.0-unstable-2026-04-23";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "fde64eaa1684c13225ace45e5f29bf91a254593f";
    sha256 = "sha256-SEifgErU1tESo5o+Rmeui08ai5uKg0xJqsqK4+EA/yg=";
  };

  vendorHash = "sha256-jNlc+ZA2QHxfcgZA4VuT2zUa4vHBCt5GO2egs5bvo/4=";

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
