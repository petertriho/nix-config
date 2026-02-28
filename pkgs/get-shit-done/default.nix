{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  nodejs,
}:
stdenvNoCC.mkDerivation {
  pname = "get-shit-done";
  version = "1.22.0-unstable-2026-02-28";

  src = fetchFromGitHub {
    owner = "gsd-build";
    repo = "get-shit-done";
    rev = "1c58e84eb3c9711c3f66cd487d7294d4b640c474";
    hash = "sha256-J2zBoqn6X5XHzPpUWezg7iT01c94m14HBwRK8bfYwRo=";
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
