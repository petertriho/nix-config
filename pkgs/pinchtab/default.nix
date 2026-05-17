{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0-unstable-2026-05-17";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "2f285bb6341e16b3ca01aa0b5d7a1d4ff00345fa";
    sha256 = "sha256-JqlLZ/gmna9opeSFelDV4US2IkGGB2YLEIfDnFafzjE=";
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
