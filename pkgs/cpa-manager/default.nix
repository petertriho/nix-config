{
  buildGoModule,
  buildNpmPackage,
  fetchFromGitHub,
  lib,
  nodejs_22,
}:
let
  version = "0-unstable-2026-05-19";

  src = fetchFromGitHub {
    owner = "seakee";
    repo = "CPA-Manager";
    rev = "c8f24addf2379eafdd9045721f415585fa383ef8";
    hash = "sha256-2qsfn/QqNCCKtHGgpLbrwXMzOEnKn1dwS0CdPM1Sgmo=";
  };

  frontend = buildNpmPackage {
    pname = "cpa-manager-frontend";
    inherit version src;

    nodejs = nodejs_22;
    patches = [ ./package-lock.patch ];
    patchFlags = [ "-p0" ];
    npmDepsHash = "sha256-xRgHqP+w7uRCrq0UG+ywHzwK7V3Kf6vLjkHt9RchrNg=";
    npmBuild = "VERSION=v${version} npm run build";

    installPhase = ''
      runHook preInstall

      install -Dm644 dist/index.html $out/management.html
      runHook postInstall
    '';
  };
in
buildGoModule {
  pname = "cpa-manager";
  inherit version src;

  sourceRoot = "${src.name}/usage-service";
  vendorHash = "sha256-dsmRXd5moOA08U2Hbi9Z3Hy1inZFiDOD9AMS56uk+8g=";

  preBuild = ''
    cp ${frontend}/management.html internal/httpapi/web/management.html
  '';

  ldflags = [
    "-s"
    "-w"
  ];

  meta = with lib; {
    description = "Management panel and usage service for CLIProxyAPI";
    homepage = "https://github.com/seakee/CPA-Manager";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "cpa-manager";
  };
}
