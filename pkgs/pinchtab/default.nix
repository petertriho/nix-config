{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.7.8-unstable-2026-03-11";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "804ba5b8fca7ba0e54683f82209ce8de48656a36";
    sha256 = "sha256-aeqGA7Ilwmp3riq2TCZXjSLYXJQi+5/JKi6PrQQA+/U=";
  };

  vendorHash = "sha256-UFN1cD8urfTUCoXV6UovT/NHwAT2MmWTr4I1R/oTno8=";

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
