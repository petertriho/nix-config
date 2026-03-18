{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.3-unstable-2026-03-17";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "c824574c3a05073dec2f5e9c219e22ffff8de445";
    sha256 = "sha256-ApLgpfYJsgadhTwfxf06AXTHclZuv41Dpl4oCFuXVZo=";
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
