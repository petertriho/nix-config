{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.9.1-unstable-2026-04-15";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "3ad13deb793059be89eadd768c42d60fc4105ab0";
    sha256 = "sha256-Suyezq3f/NFlF5qGJ6nFE4hl8UfvFKLwfs8Ay3/FKHQ=";
  };

  vendorHash = "sha256-jNlc+ZA2QHxfcgZA4VuT2zUa4vHBCt5GO2egs5bvo/4=";

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
