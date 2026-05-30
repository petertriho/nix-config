{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0-unstable-2026-05-29";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "c20ebac6ac1d26cbe21fb24033f3233f29d4cd49";
    sha256 = "sha256-4jT0WBybjx2O0y3AXXdIzpZez8HvRWcT3mtzixYoBpo=";
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
