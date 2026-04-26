{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.10.0-unstable-2026-04-25";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "78b53a54b287b4b1f0dd70d4b6064e2dcbf3fd73";
    sha256 = "sha256-pw1g1Os02xzGz3I5pxo7nrA87Z/Lfk56Zx4BkQlZBWY=";
  };

  vendorHash = "sha256-jbGGxyTiTCQ1um0AV7YXOf55KqquVx4248qVZ+CZVXw=";

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
