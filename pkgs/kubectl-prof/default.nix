{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "1.11.1-unstable-2026-03-25";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "21c6c80d355ced16df60d832e318a7ab80d602d9";
    hash = "sha256-bZtPTrviHg9zmMqQ65VxcE1JpqXlXxBf2Medu8qoU0I=";
  };

  vendorHash = "sha256-ftJnXZaQISVsjwAwDAaQO6C8U2+D3GFxHHUEvN8Z+C4=";

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
