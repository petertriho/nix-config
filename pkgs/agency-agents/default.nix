{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  bash,
}:
stdenvNoCC.mkDerivation {
  pname = "agency-agents";
  version = "0-unstable-2026-03-27";

  src = fetchFromGitHub {
    owner = "msitarzewski";
    repo = "agency-agents";
    rev = "4feb0cd736dd0e2e9830cd54dfc99770621bed90";
    sha256 = "sha256-xvZHXUDh8sD+EW+jxnF3C/AP6Rea4GFmx4Ox/B/SR9s=";
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
