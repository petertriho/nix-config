{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_22,
  makeWrapper,
}:
buildNpmPackage {
  pname = "beads-ui";
  version = "0.10.0-unstable-2026-02-25";

  src = fetchFromGitHub {
    owner = "mantoni";
    repo = "beads-ui";
    rev = "6acaa3f5b232dd028f17444900a2b3e771282bf1";
    hash = "sha256-eKU9P1+xgeK0QY69hEVBoFxir/eVmynO9I/El2Iw2Qs=";
  };

  # The upstream package-lock.json is missing resolved/integrity for many
  # transitive dev dependencies. Use a regenerated lockfile with all fields.
  postPatch = ''
    cp ${./package-lock.json} package-lock.json
  '';

  npmDepsHash = "sha256-gTdEtj8vlUFCd5DqJ8ban2HDCauRwwukrBrqiuL0V70=";

  nodejs = nodejs_22;
  nativeBuildInputs = [ makeWrapper ];
  makeCacheWritable = true;
  npmFlags = [ "--include=dev" ];

  npmBuildScript = "build";

  dontNpmInstall = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/node_modules/beads-ui
    mkdir -p $out/bin

    cp -r app $out/lib/node_modules/beads-ui/
    cp -r bin $out/lib/node_modules/beads-ui/
    cp -r server $out/lib/node_modules/beads-ui/
    cp package.json $out/lib/node_modules/beads-ui/
    cp -r node_modules $out/lib/node_modules/beads-ui/

    find $out/lib/node_modules/beads-ui -name "*.test.js" -delete

    makeWrapper ${nodejs_22}/bin/node $out/bin/bdui \
        --add-flags "$out/lib/node_modules/beads-ui/bin/bdui.js"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Local UI for Beads — Collaborate on issues with your coding agent";
    homepage = "https://github.com/mantoni/beads-ui";
    license = licenses.mit;
    mainProgram = "bdui";
  };
}
