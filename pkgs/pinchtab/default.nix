{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.7.8-unstable-2026-03-09";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "3ffc049a1302aacb2fb8d51ae1501d6cebd9eacf";
    sha256 = "sha256-2SVfXINvR1Lc3IAa4nSjEmSc0Ttwf1lcLVD7VZn+/8E=";
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
