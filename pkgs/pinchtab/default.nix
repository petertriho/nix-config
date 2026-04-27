{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.10.0-unstable-2026-04-26";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "aaf4130b4e8275c9679bfda7a341479a3d0fe457";
    sha256 = "sha256-gm4rgbBNGJ5pyWaKYN5Lxov1D8BzTO73n7FGuvDAQ7c=";
  };

  vendorHash = "sha256-bGwytX0JsBjnWsyqVoAoebQwXUZsR1jYAI6BG2cCiA4=";

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
