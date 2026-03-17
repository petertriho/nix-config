{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.2-unstable-2026-03-17";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "1a22e2833273fe4dc9b084f0f6875c56edf900a4";
    sha256 = "sha256-ZAgH0JrDyP6HdqyZhXw4R7oJdRqQTgjKNwXDN3asIv8=";
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
