{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "2.2.0-unstable-2026-05-06";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "050d3fd6157982ebed281488c7d7e01820278fe2";
    hash = "sha256-Abj9uEkSEK1aFvE7A9/0sMAwdRc17acDhMm8wwitT1E=";
  };

  vendorHash = "sha256-avYBo18gSv0wut9XruqhnKVhagdQpzt5Zcy4hoSpBwE=";

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
