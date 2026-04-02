{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.6-unstable-2026-04-01";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "251d9ecb14a565d389ed75e34777dca19ed29228";
    sha256 = "sha256-7kWQ1O/QDgkKwJQ5j4GXAAMA581LGTGfYVLbIvd/MQw=";
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
