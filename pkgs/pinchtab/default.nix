{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.9.1-unstable-2026-04-16";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "b168d9ae3bba96a9f86f1fcc558bd4c9656a6885";
    sha256 = "sha256-OzC+TWzMwCY8NoDjE74+m6fQr16TTj0CDJIyc84zhCI=";
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
