{
  lib,
  stdenv,
  fetchFromGitHub,
}:
stdenv.mkDerivation {
  pname = "pi-history";
  version = "0.1.5";

  src = fetchFromGitHub {
    owner = "sagmans";
    repo = "pi-history";
    rev = "75d3d2b5aa33cd8487cb5d9835e247584d731874";
    hash = "sha256-U02TYUwPhnYdgs5al5kaEA/Oj18jfH7RtLPTn80OlP0=";
  };

  dontBuild = true;

  # pi-history ships raw TypeScript (pi.extensions = ["./index.ts"]) that pi
  # loads directly, and its only imports are the @earendil-works/* packages pi
  # injects as peerDependencies at runtime. It therefore has zero runtime
  # dependencies — unlike the other extensions in this overlay, buildNpmPackage
  # buys nothing here and would fetch a ~380MB dev-only FOD (the whole
  # pi-coding-agent dev tree, all pruned by --omit=dev) for a package with no
  # build step. A plain copy of the files upstream declares in its `files`
  # field is sufficient and correct. The install path matches pi's
  # piPackageRoot helper, which resolves lib/node_modules/<pname>.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-history
    mkdir -p "$packageRoot"
    cp package.json index.ts config.json config.local.example.json "$packageRoot/"
    cp -r src "$packageRoot/"
    cp -r resources "$packageRoot/"

    runHook postInstall
  '';

  meta = {
    description = "Ghost completion for prompt history in pi's TUI";
    homepage = "https://github.com/sagmans/pi-history";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
