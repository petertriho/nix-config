{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.9.0-unstable-2026-04-15";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "3a344dd53ab8a38713c67972121aaf0e26c80f2f";
    sha256 = "sha256-0ofB7GkRV+8o/UZApqGDkNVhK1/szYswmNymqsYdYUY=";
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
