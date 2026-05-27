{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0-unstable-2026-05-26";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "5117fb079d6952c7bc19ba4900de0f49b1e245cd";
    sha256 = "sha256-WHReDdKpYxDJW1XPCFpinDAS6uF+SB/DIOrgkPhf7/8=";
  };

  vendorHash = "sha256-CM0ou/CyIhIrDgPIdb9TVatZuRx7IiQP0Vqys9C/CZ8=";

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
