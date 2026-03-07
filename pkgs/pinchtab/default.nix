{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.7.8-unstable-2026-03-06";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "cd5f42aa6c813c5e976d388d2a029bbf31625a4f";
    sha256 = "sha256-szQ/pWVhkk9jAUZIT3/vF1JZhtuoFPAzjeHUQ3XQgvM=";
  };

  vendorHash = "sha256-l6dOEWaG4w8WoS4RvAa5AD0ynmXThJnZLUMzFvATAlE=";

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
