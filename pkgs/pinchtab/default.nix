{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0-unstable-2026-05-06";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "0db1c5d2c9bdd2f6e4c49db4d598e466e1924693";
    sha256 = "sha256-hbHxAG4hL3tv1qC5sMXqFU7sP2Pm2uK3DuWz+75YRWQ=";
  };

  vendorHash = "sha256-VAKkswzho17OkxhB5dCayp4uLvbiU18UcAATyMczUBA=";

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
