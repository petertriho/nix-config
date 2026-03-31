{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.6-unstable-2026-03-31";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "93e0ba7c3abc8c01a37588da6b5208c134b332a9";
    sha256 = "sha256-bgKjRY9IPwn4IAruJy13xr+HrnkoVbRq2mpecTbVM/U=";
  };

  vendorHash = "sha256-4HLMsWe7RIeiZrnRD103ZY1HjehhbYpczIv4T6ro14Q=";

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
