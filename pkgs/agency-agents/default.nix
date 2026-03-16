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
    rev = "6254154899f510eb4a4de10561fecfc1f32ff17f";
    sha256 = "sha256-kjpQZo3S8E0bYOhkMqOzOr1V133yTZzAMC/eQqwA84Y=";
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
