{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "2.2.0-unstable-2026-09-11";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "210a43ffbc53ff0c5c23be752fe66f7445133c96";
    hash = "sha256-xyZ2rkGqZJqe5K5C7dMCkoy8EYFTGMiJ5HqtDffCsu4=";
  };

  vendorHash = "sha256-IpCS7YAw00Ffnc2jJwrt/hM/uTJ5dt3AFrnvH/YNaDA=";

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
