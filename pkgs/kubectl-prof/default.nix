{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "1.11.1-unstable-2026-03-20";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "d310cc64fcb79d8a0139e0485af6120fab38ece7";
    hash = "sha256-RWFlhfI2Swf6OFCEi8271MJtcRO8Q8kO/l0JFCx1iu0=";
  };

  vendorHash = "sha256-aYErIUSOOoKVwspLvoE80Wa+KTB8Gna6zuPgUMsT/04=";

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
