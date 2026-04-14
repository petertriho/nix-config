{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.9.0-unstable-2026-04-13";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "fe53683aa965ea649f3949fbb33a0a1c394a4f06";
    sha256 = "sha256-kQQOaTq4nTKgtz3Ga7GGs81tFEgru5keSauUAyuRbzQ=";
  };

  vendorHash = "sha256-rBJPoeTCaA2DIbouNt5dr++NB3zf8CThIP851XqWvnY=";

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
