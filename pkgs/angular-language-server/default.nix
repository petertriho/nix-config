{
  lib,
  buildNpmPackage,
  fetchurl,
  makeWrapper,
  nodejs,
}:
buildNpmPackage rec {
  name = "angular-language-server";
  version = "18.2.0";

  src = fetchurl {
    url = "https://registry.npmjs.org/@angular/language-server/-/language-server-${version}.tgz";
    hash = "sha256-UvYOxs59jOO9Yf0tvX96P4R/36qPeEne+NQAFkg9Eis=";
  };

  nativeBuildInputs = [
    makeWrapper
  ];

  patches = [ ./package-json.diff ];

  postPatch = ''
    ln -s ${./package-lock.json} package-lock.json
  '';

  postInstall =
    # sh
    ''
      rm $out/bin/ngserver

      makeWrapper ${lib.getExe nodejs} "$out/bin/ngserver" \
        --add-flags "$out/lib/node_modules/@angular/language-server/bin/ngserver" \
        --add-flags "--ngProbeLocations $out/lib/node_modules/@angular/language-server/node_modules" \
        --add-flags "--tsProbeLocations $out/lib/node_modules/@angular/language-server/node_modules"
    '';

  npmDepsHash = "sha256-h5wKcHl8xcdXEtM8OnSeILr0EOpObDrBeR/5n+Z72kE=";
  dontNpmBuild = true;
}
