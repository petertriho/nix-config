{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  nodejs,
}:
stdenvNoCC.mkDerivation {
  pname = "get-shit-done";
  version = "1.21.1-unstable-2026-02-27";

  src = fetchFromGitHub {
    owner = "gsd-build";
    repo = "get-shit-done";
    rev = "19ac77e25dc7f48d69d2c31bd6af1d9b78f57f34";
    hash = "sha256-skRgw25kOe9s8xoM/WEZSOi3gTAT4mW59RGxNOzDz00=";
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
