{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "2.0.0-unstable-2026-03-27";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "36dead4870ecf97bfbfadb85b9302752c26c64d1";
    hash = "sha256-4LJrwj0nQGWthykB6wOW9Zqr7U39B+bnmEmwwWexW1M=";
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
