{
  buildGoModule,
  buildNpmPackage,
  fetchFromGitHub,
  lib,
  nodejs_22,
}:
let
  version = "1.11.11-unstable-2026-08-03";

  src = fetchFromGitHub {
    owner = "seakee";
    repo = "CPA-Manager-Plus";
    rev = "2f7783f0a0c0b5d3352672a7608c1e16becacec2";
    hash = "sha256-/ms175dVb/S8kH8Vc2CLQUlTzZg5wdNZMcr3OW41Mgo=";
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
  vendorHash = "sha256-uJGAp0OI+kPYEqycceleOFbl6A+Tb2PDh2QnffvNFfY=";
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
