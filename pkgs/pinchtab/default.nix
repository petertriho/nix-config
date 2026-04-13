{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.6-unstable-2026-04-12";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "cfbb4a4a58a2015be20c9e8685b0f4cea3747204";
    sha256 = "sha256-5ysODudUIRZAzSqgOdTQTy/X25RxhuIDb/H+XnKaBxM=";
  };

  vendorHash = "sha256-rBJPoeTCaA2DIbouNt5dr++NB3zf8CThIP851XqWvnY=";

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
