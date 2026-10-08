{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "kubectl-prof";
  version = "2.3.0-unstable-2026-10-07";

  src = fetchFromGitHub {
    owner = "josepdcs";
    repo = "kubectl-prof";
    rev = "5196ca1a108f9b8a29639f8d3e318ca51c95be51";
    hash = "sha256-lPy/NuxOHDXN2phDo1t96Suj2tzlM6OzbWcWV2RwCSM=";
  };

  vendorHash = "sha256-rZmipth0gHS32Z5D0VZ7SL6fEVF2FvLCOzOnO/udYKo=";

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
