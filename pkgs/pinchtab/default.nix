{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.4-unstable-2026-03-19";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "60ce4448c30d3c68edf790875bc1167d7a7b2308";
    sha256 = "sha256-gkLx5ddIUAPLhtf7ZzxwnLrCWRQeUm5iCKZaeU2xnL4=";
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
