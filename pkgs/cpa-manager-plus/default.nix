{
  buildGoModule,
  buildNpmPackage,
  fetchFromGitHub,
  lib,
  nodejs_22,
}:
let
  version = "1.12.0-unstable-2026-08-17";

  src = fetchFromGitHub {
    owner = "seakee";
    repo = "CPA-Manager-Plus";
    rev = "4837e040903b4b3dad2ab5e07731b4db8018d77a";
    hash = "sha256-N58bPE4fG8Mb3H+U6nm3rjvT9tot86UN5tVPFFHU8Ek=";
  };

  frontend = buildNpmPackage {
    pname = "cpa-manager-plus-frontend";
    inherit version src;

    nodejs = nodejs_22;
    patches = [ ./package-lock.patch ];
    patchFlags = [ "-p0" ];
    npmDepsFetcherVersion = 2;
    npmDepsHash = "sha256-7iMDA7m3BvCbDVAEcQR73JEre5RkrAaudoyIyasSxhU=";
    npmBuild = "VERSION=v${version} npm run build";

    installPhase = ''
      runHook preInstall

      install -Dm644 apps/web/dist/index.html $out/management.html
      runHook postInstall
    '';
  };
in
buildGoModule {
  pname = "cpa-manager-plus";
  inherit version src;

  sourceRoot = "${src.name}/apps/manager-server";
  vendorHash = "sha256-OhtGqAXPPbTIqGB9VvQ5UTgCNt7fw2yNKkEIgWhGuiM=";
  subPackages = [ "cmd/cpa-manager-plus" ];
  env.CGO_ENABLED = "0";

  preBuild = ''
    cp ${frontend}/management.html internal/httpapi/web/management.html
  '';

  ldflags = [
    "-s"
    "-w"
  ];

  meta = with lib; {
    description = "Management panel and analytics service for CLIProxyAPI";
    homepage = "https://github.com/seakee/CPA-Manager-Plus";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "cpa-manager-plus";
  };
}
