{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:

buildGoModule rec {
  pname = "kubectl-prof";
  version = "1.11.1";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    tag = version;
    hash = "sha256-NrYxjOXqUXbgTN7XFpmiQ2qO8hm2LAvqVQLToL71E/0=";
  };

  vendorHash = "sha256-61OQdiDlGIo+v2vt50erFoZNWQo+4x68Yo0JAZY5ChA=";

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
