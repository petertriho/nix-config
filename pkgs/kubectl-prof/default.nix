{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "1.11.1-unstable-2026-03-07";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "0d1b45a6f576524da133fd63f4bdc13a13b8f131";
    hash = "sha256-4yLqEDWH5rpgX20px3vCWazgcPDt5FQ42E8ApRxvOWs=";
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
