{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.8.6-unstable-2026-03-26";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "d0032c5a5e4a7868ed18ff7818a08b466d6efa97";
    sha256 = "sha256-oaOd7etLNHnr/2hhu9My5zdxDpZ1g0A55XcGm1s6tP4=";
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
