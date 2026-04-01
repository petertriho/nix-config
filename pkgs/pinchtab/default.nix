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
    rev = "b964d0e6c6baef7de57ca2a8396c11a69775d95f";
    sha256 = "sha256-vSf0Y/JnLjMTff20ZijpOstBJcRiQLZif5J0Z4SJTaU=";
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
