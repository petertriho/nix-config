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
    rev = "b4f8ce77e313b5220a4ef39073ec60232e1ffbc7";
    sha256 = "sha256-7wDza+JzVg3x+YyjynUEQPXJTduQC1QdGwRZmo64G00=";
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
