{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.1-unstable-2026-03-15";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "12324e88290719953e2e4c175ce70b97a39965a9";
    sha256 = "sha256-pxhodjhL5reZVNR5DLoD+sCmL8tKyPYoJZuzitoETQQ=";
  };

  vendorHash = "sha256-pOF9KHf51WIajSjNo/2fZDVG2v1+f6EC4ZROYhWa8YU=";

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
