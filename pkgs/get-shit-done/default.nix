{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  nodejs,
}:
stdenvNoCC.mkDerivation {
  pname = "get-shit-done";
  version = "1.21.0-unstable-2026-02-25";

  src = fetchFromGitHub {
    owner = "gsd-build";
    repo = "get-shit-done";
    rev = "7f5ae23fc25abe8efbaa5baf944af64ad7e0ac8f";
    hash = "sha256-HqacboThiUv5NO4ARRvu/c8UJSWy/Mdocq4k49jY9gQ=";
  };

  nativeBuildInputs = [ nodejs ];

  installPhase = ''
    runHook preInstall

    export HOME=$TMPDIR
    mkdir -p $HOME/.config/opencode

    mkdir -p $out/share/opencode

    node bin/install.js --opencode --global --config-dir $out/share/opencode

    for f in $out/share/opencode/agents/*.md; do
      sed -i '1a mode: subagent' "$f"
    done

    runHook postInstall
  '';

  meta = with lib; {
    description = "Meta-prompting and spec-driven development system for Claude Code and OpenCode";
    homepage = "https://github.com/gsd-build/get-shit-done";
    license = licenses.mit;
    maintainers = [ ];
  };
}
