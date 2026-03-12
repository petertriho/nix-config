{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "pinchtab";
  version = "0.7.8-unstable-2026-03-12";

  src = fetchFromGitHub {
    owner = "pinchtab";
    repo = "pinchtab";
    rev = "eeaa6306ec2eafd518a8f268c3ddceaf1f8e09f8";
    sha256 = "sha256-AxYy9PzpWmYOpUmw4mxxP+qwjcq0ZdxQbgVRVngKSK8=";
  };

  vendorHash = "sha256-VxoZoySjg3V9R0aqqz728qdLa8rydGfbwag+ch3eqyE=";

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
