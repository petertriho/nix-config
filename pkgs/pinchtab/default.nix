{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0-unstable-2026-05-08";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "77bc3a0500e332d7ad4c6356adfe4ca72441e0f2";
    sha256 = "sha256-AHobFPfXbWpcubHaBxHnM9e2DrO9jqMTDDfxKpH1h1A=";
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
