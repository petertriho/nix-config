{
  lib,
  stdenv,
  fetchFromGitHub,
  python3,
  fish,
  makeWrapper,
}:

stdenv.mkDerivation rec {
  pname = "shellock";
  version = "0-unstable-2026-01-15";

  src = fetchFromGitHub {
    owner = "ibehnam";
    repo = "shellock";
    rev = "64f7b0e5b5e182cbb99b9d2476fb6aebe8b3135b";
    hash = "sha256-EBp+uVpD+cM7cxvUrYDt3X+qERHdk+hEwVveTs55kxA=";
  };

  patches = [
    ./fix-abbr-expansion.patch
  ];

  nativeBuildInputs = [ makeWrapper ];
  buildInputs = [
    python3
    fish
  ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    # Install the Python script with corrected shebang
    install -Dm755 shellock.py $out/bin/shellock

    # Fix the shebang to use python3 directly (not uv)
    substituteInPlace $out/bin/shellock \
      --replace-fail '#!/usr/bin/env -S uv run --script' '#!${python3}/bin/python3'

    # Create fish plugin directory structure
    mkdir -p $out/conf.d

    # Install fish functions in conf.d (loaded before key_bindings.fish)
    # This ensures all functions are defined before keybindings try to use them
    substitute shellock.fish $out/conf.d/shellock.fish \
      --replace-fail "\$HOME/Downloads/shellock/shellock.py" "$out/bin/shellock"

    # Install key bindings (no need to source shellock.fish, it's in conf.d)
    substitute shellock_bindings.fish $out/key_bindings.fish \
      --replace-fail "source \"\$HOME/Downloads/shellock/shellock.fish\"" \
                "# Functions are defined in conf.d/shellock.fish"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Real-time CLI flag explainer for fish shell";
    longDescription = ''
      Shellock is a real-time CLI flag explainer for the fish shell.
      It shows flag descriptions as you type commands by parsing --help
      output and man pages. Features include automatic caching of results,
      support for various man page formats, and seamless fish shell integration.
    '';
    homepage = "https://github.com/ibehnam/shellock";
    license = licenses.mit;
    maintainers = [ ];
    platforms = platforms.unix;
    mainProgram = "shellock";
  };
}
