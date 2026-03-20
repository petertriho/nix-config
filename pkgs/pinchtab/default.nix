{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.4-unstable-2026-03-20";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "b70c6ce99ff3865a608c18251103dd40013dee83";
    sha256 = "sha256-RxTiaEEBAU/TmGZJS8hKOHAbmwDh8CSAYghpy6gSJUE=";
  };

  vendorHash = "sha256-ObmrCbfz07iqJmawHDsYOb1fkhSwhtiIQJdEyv3fBro=";

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
