{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "autoresearch";
  version = "2.2.2-unstable-2026-08-12";

  src = fetchFromGitHub {
    owner = "uditgoenka";
    repo = "autoresearch";
    rev = "050e30dc4ba0974b03f2873111b9901ec3211390";
    hash = "sha256-Hwxlit87HPoHLLDiX/Tz4L5ONvmDf5B71KhTePNLyhU=";
  };

  dontBuild = true;

  # The upstream Claude plugin registers eight always-on hooks that fire on every
  # session and tool call, duplicating nono's blocking and spawning node per tool
  # use. Claude Code discovers hooks by directory rather than through
  # plugin.json, so dropping hooks/ leaves the commands and skill intact. The
  # test guards against an upstream move silently reinstating them.
  installPhase = ''
    runHook preInstall

    test -d claude-plugin/hooks

    install -d $out/share/autoresearch/agents
    cp -r claude-plugin $out/share/autoresearch/
    rm -rf $out/share/autoresearch/claude-plugin/hooks
    cp -r .opencode $out/share/autoresearch/opencode
    cp -r .agents/skills $out/share/autoresearch/agents/skills

    runHook postInstall
  '';

  meta = with lib; {
    description = "Autonomous goal-directed iteration engine for coding agents";
    homepage = "https://github.com/uditgoenka/autoresearch";
    license = licenses.mit;
    maintainers = [ ];
  };
}
