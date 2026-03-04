{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "unstable-2026-03-03";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "82ab9a16a4d9786aeed82647a5dc75d0ac7f1d38";
    sha256 = "1wjakciparf1alwlhsaxwfhsvsi3bw42ji2j3zsb6dwyhikpz9sb";
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
