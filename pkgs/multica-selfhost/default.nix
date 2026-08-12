{
  coreutils,
  curl,
  gnutar,
  inetutils,
  jq,
  lib,
  makeWrapper,
  postgresql_17,
  stdenvNoCC,
}:
let
  versionData = import ../multica/version.nix;
  inherit (versionData) version tag;

  backendImage = "ghcr.io/multica-ai/multica-backend:${tag}";
  frontendImage = "ghcr.io/multica-ai/multica-web:${tag}";
  postgresImage = "pgvector/pgvector:pg17@sha256:7ae6051efd0e60444282c27c7e141af07f322ce033300e727a49c3dd11075e38";
in
stdenvNoCC.mkDerivation {
  pname = "multica-selfhost";
  inherit version;

  dontUnpack = true;

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    install -Dm444 ${./compose.yaml} "$out/share/multica-selfhost/compose.yaml"
    substituteInPlace "$out/share/multica-selfhost/compose.yaml" \
      --replace-fail '@postgresImage@' '${postgresImage}' \
      --replace-fail '@backendImage@' '${backendImage}' \
      --replace-fail '@frontendImage@' '${frontendImage}'

    install -Dm555 ${./multica-selfhost} "$out/bin/multica-selfhost"
    substituteInPlace "$out/bin/multica-selfhost" \
      --replace-fail '@version@' '${version}' \
      --replace-fail '@tag@' '${tag}' \
      --replace-fail '@composeFile@' "$out/share/multica-selfhost/compose.yaml" \
      --replace-fail '@postgresImage@' '${postgresImage}' \
      --replace-fail '@backendImage@' '${backendImage}' \
      --replace-fail '@frontendImage@' '${frontendImage}' \
      --replace-fail '@curl@' '${lib.getExe curl}' \
      --replace-fail '@date@' '${lib.getExe' coreutils "date"}' \
      --replace-fail '@hostname@' '${lib.getExe' inetutils "hostname"}' \
      --replace-fail '@jq@' '${lib.getExe jq}' \
      --replace-fail '@mkdir@' '${lib.getExe' coreutils "mkdir"}' \
      --replace-fail '@mktemp@' '${lib.getExe' coreutils "mktemp"}' \
      --replace-fail '@mv@' '${lib.getExe' coreutils "mv"}' \
      --replace-fail '@pgRestore@' '${lib.getExe' postgresql_17 "pg_restore"}' \
      --replace-fail '@rm@' '${lib.getExe' coreutils "rm"}' \
      --replace-fail '@sha256sum@' '${lib.getExe' coreutils "sha256sum"}' \
      --replace-fail '@sleep@' '${lib.getExe' coreutils "sleep"}' \
      --replace-fail '@tar@' '${lib.getExe gnutar}'

    patchShebangs "$out/bin/multica-selfhost"

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    bash ${./tests/test-foundation.sh} "$out/bin/multica-selfhost"
    bash ${./tests/test-lifecycle.sh} "$out/bin/multica-selfhost"
    bash ${./tests/test-backup.sh} "$out/bin/multica-selfhost"
    bash ${./tests/test-restart.sh} "$out/bin/multica-selfhost"
    bash ${./tests/test-restore.sh} "$out/bin/multica-selfhost"
    runHook postInstallCheck
  '';

  passthru = {
    inherit
      backendImage
      frontendImage
      postgresImage
      versionData
      ;
    composeFile = "${placeholder "out"}/share/multica-selfhost/compose.yaml";
  };

  meta = {
    description = "Version-locked local Multica Docker Compose stack";
    homepage = "https://github.com/multica-ai/multica";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-darwin"
    ];
  };
}
