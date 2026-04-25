{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "unstable-2026-04-25";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "08e36619b8269bd3680386f2d28615ecee689596";
    sha256 = "0427vbsrmrpdhvm4520pahk6y8qavgpdpsy6cxa13k27akn2zn1q";
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
