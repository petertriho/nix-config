{
  buildGoModule,
  buildNpmPackage,
  fetchFromGitHub,
  lib,
  nodejs_22,
}:
let
  version = "0-unstable-2026-05-28";

  src = fetchFromGitHub {
    owner = "seakee";
    repo = "CPA-Manager";
    rev = "b7c23ef13b45396508bdfa8df1167f35f1dbeffd";
    hash = "sha256-zOm/ZN1aUh+Kr3EZRarN9xL352ua0LsQG3wGa/nfNOg=";
  };

  frontend = buildNpmPackage {
    pname = "cpa-manager-frontend";
    inherit version src;

    nodejs = nodejs_22;
    patches = [ ./package-lock.patch ];
    patchFlags = [ "-p0" ];
    npmDepsHash = "sha256-8yXZ8bAgEIovIV8ACDvQrFDtltHpOGWpkvGhDHyEeD0=";
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
