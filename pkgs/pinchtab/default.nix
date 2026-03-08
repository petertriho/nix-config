{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.7.8-unstable-2026-03-08";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "cc81abfc5ebbb1cd6fac18d0e2d95dfefa11f345";
    sha256 = "sha256-OZxpdTdWIgqtxGzI7pbJxyEAj3kjrgJArilRd3uJ734=";
  };

  vendorHash = "sha256-l6dOEWaG4w8WoS4RvAa5AD0ynmXThJnZLUMzFvATAlE=";

  subPackages = [ "cmd/pinchtab" ];

  ldflags = [
    "-s"
    "-w"
    "-X main.version=${version}"
  ];

  postInstall = ''
    mkdir -p $out/share/pinchtab
    cp -r skill $out/share/pinchtab/
  '';

  meta = with lib; {
    description = "Browser automation bridge and multi-instance orchestrator";
    homepage = "https://github.com/pinchtab/pinchtab";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "pinchtab";
  };
}
