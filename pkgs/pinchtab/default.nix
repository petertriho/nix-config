{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.6-unstable-2026-04-09";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "92c898abd1fc3bef0ed87569ea347954d9f34726";
    sha256 = "sha256-+viL+RyFD0vP9r7TKFtrc2/bR7S+iiQptlVsRdpEOhE=";
  };

  vendorHash = "sha256-4HLMsWe7RIeiZrnRD103ZY1HjehhbYpczIv4T6ro14Q=";

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
