{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.10.0-unstable-2026-05-04";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "baad67ab1b1ae6e857a7ab03a92caf5acddd2262";
    sha256 = "sha256-IpVUm7CtxTtRYBoMCxyvEMTMZp6tj7/s01tBl6l2uzc=";
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
