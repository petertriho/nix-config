{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  bash,
}:
stdenvNoCC.mkDerivation {
  pname = "agency-agents";
  version = "0-unstable-2026-03-15";

  src = fetchFromGitHub {
    owner = "msitarzewski";
    repo = "agency-agents";
    rev = "5c669c28e6162a5bfbda8d0837eae163362f52a8";
    sha256 = "sha256-+qJb4aeSwpQdXm4dWl6OCdLPCCliTnvQcgXLZNbgoBU=";
  };

  nativeBuildInputs = [ bash ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    generated="$TMPDIR/generated"
    bash ./scripts/convert.sh --tool opencode --out "$generated"

    install -d $out/share/agency-agents/integrations
    cp -r "$generated/opencode" $out/share/agency-agents/integrations/

    runHook postInstall
  '';

  meta = with lib; {
    description = "OpenCode integrations generated from agency-agents";
    homepage = "https://github.com/msitarzewski/agency-agents";
    license = licenses.mit;
    maintainers = [ ];
  };
}
