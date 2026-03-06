{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.7.7-unstable-2026-03-05";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "02c2396e2c752f71837d5603ddc1f1e11f7ec057";
    sha256 = "sha256-VijwJScQj5uEC0KfVTMae7JmQHXOnwA9aWyfSHxbBw8=";
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
