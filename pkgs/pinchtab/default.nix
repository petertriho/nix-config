{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.2-unstable-2026-03-16";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "1ab7c75109d105e40151273fa0ac618eb899c4de";
    sha256 = "sha256-CpvZ/32qpAiQN7YJ3t3pWRK/uiK7938T6kEZumXVmFs=";
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
