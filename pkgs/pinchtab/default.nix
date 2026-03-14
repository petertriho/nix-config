{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.7.8-unstable-2026-03-14";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "7eb3725d41576249a3bfb3195d8753ce9ed04248";
    sha256 = "sha256-7YFI2kWD1ZHSaGeK5pwwZmzkgcF1Ijeze55r0TOzgf8=";
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
