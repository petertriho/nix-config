{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "2.2.0-unstable-2026-05-18";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "54102918596c48e6e0d4e453361f958907db9db8";
    hash = "sha256-78ZNw3SjFYFAQu6rlpF7d3nhVsousy6qRceUKCvg1Rw=";
  };

  vendorHash = "sha256-XYIc0J10VDVtcMMnuizD/pwDOTI/kBVlOgSQsjsi1IM=";

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
