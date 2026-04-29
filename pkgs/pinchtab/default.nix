{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.10.0-unstable-2026-04-28";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "13e6c9dc8056140b533081a861a6ec49e480a8d7";
    sha256 = "sha256-uF/sHld8UosXJAKnJMEwxKmBNcw8bakcry4Hi54KUtc=";
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
