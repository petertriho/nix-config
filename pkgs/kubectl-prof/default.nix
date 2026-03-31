{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "2.1.0-unstable-2026-03-30";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "9cb34115ba4a2f97b07e0c7938ba7235e1c6c28a";
    hash = "sha256-0jxGfY9izOYuw/PRavD4/ACFFAo8+l4eGVLuk6NjDOE=";
  };

  vendorHash = "sha256-yvBD2kb9CWf/sm+p1WxppBl0WUjYScGg2QGfH+ycmfg=";

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
