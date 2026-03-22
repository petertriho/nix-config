{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.5-unstable-2026-03-22";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "ce7efa1c3d564cafcf094fcdbd22ffdd7863e71d";
    sha256 = "sha256-BISjLngDP2Vmgme4ob6MDywtf3wSjGfpkV+idbMsRD0=";
  };

  vendorHash = "sha256-ycw67MzaJNw4TYoD1CyFGH1/qEQQDXPRdlWML88NzLw=";

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
