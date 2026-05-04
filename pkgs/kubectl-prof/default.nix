{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "2.2.0-unstable-2026-05-04";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "842f4350cd8ab9f0179d62dbf5098604317e84eb";
    hash = "sha256-W/DqezKg4arRPdTH3f9Fsl5mMw7YaQXqcbv90ZbW4+I=";
  };

  vendorHash = "sha256-tbtCgRbw10t13gBHX6Tn8K5oEBw5wh1k2QUYtnKUgrw=";

  subPackages = [ "cmd/cli" ];

  ldflags = [
    "-s"
    "-w"
    "-X github.com/josepdcs/kubectl-prof/internal/cli/version.semver=${version}"
  ];

  postInstall = ''
    mv $out/bin/cli $out/bin/kubectl-prof
  '';

  meta = with lib; {
    description = "Kubectl plugin to profile applications on Kubernetes with minimum overhead";
    homepage = "https://github.com/josepdcs/kubectl-prof";
    license = licenses.asl20;
    maintainers = [ ];
    mainProgram = "kubectl-prof";
  };
}
