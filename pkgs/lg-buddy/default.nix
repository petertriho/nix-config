{
  lib,
  rustPlatform,
  fetchFromGitHub,
  makeWrapper,
  runtimeShell,
  coreutils,
  gnugrep,
  networkmanager,
  systemd,
}:
rustPlatform.buildRustPackage {
  pname = "lg-buddy";
  version = "1.8.0-unstable-2026-09-17";

  src = fetchFromGitHub {
    owner = "Staphylococcus";
    repo = "LG_Buddy";
    rev = "ed0b740ee3873177682efe2d1f6ae7930e847aef";
    hash = "sha256-yZDP4bP902UZ9eek4tQEa+q0jTlw8toMfN+bl6qEz7M=";
  };

  cargoHash = "sha256-+LVqDrRqjR6lxN6SNHeoVEmG/tqhvu06R2SEIPgXctQ=";

  nativeBuildInputs = [ makeWrapper ];

  cargoBuildFlags = [
    "-p"
    "lg-buddy"
  ];

  doCheck = false;

  postInstall = ''
    # Forward pairing to upstream setup, retaining its argument/env interface.
    # At this pinned revision, Pairing must pass local credential validation
    # before the CLI reports the declarative Services block. Reuse that result
    # instead of guessing the config/token path: setup and settings share the
    # upstream resolver, including XDG_CONFIG_HOME and installation pointers.
    # This establishes pairing readiness only, not service activation.
    cat > $out/bin/lg-buddy-configure <<'FORWARDER'
    #!${runtimeShell}
    set -euo pipefail
    RUNTIME_BINARY="''${LG_BUDDY_RUNTIME_BINARY:-$(${coreutils}/bin/dirname "$0")/lg-buddy}"
    if [ ! -x "$RUNTIME_BINARY" ] && [ -z "''${LG_BUDDY_RUNTIME_BINARY:-}" ]; then
      RUNTIME_BINARY="$(command -v lg-buddy || true)"
    fi
    if [ -z "$RUNTIME_BINARY" ] || [ ! -x "$RUNTIME_BINARY" ]; then
      echo 'Could not find the lg-buddy binary; reinstall lg-buddy, then rerun setup.' >&2
      exit 1
    fi
    args=()
    if [ "''${LG_BUDDY_NONINTERACTIVE:-0}" = 1 ]; then
      args+=(--non-interactive --yes)
    fi
    [ -z "''${LG_BUDDY_TV_IP:-}" ] || args+=(--tv-ip "$LG_BUDDY_TV_IP")
    [ -z "''${LG_BUDDY_TV_MAC:-}" ] || args+=(--tv-mac "$LG_BUDDY_TV_MAC")
    [ -z "''${LG_BUDDY_INPUT:-}" ] || args+=(--input "$LG_BUDDY_INPUT")
    out="$(${coreutils}/bin/mktemp)"
    trap '${coreutils}/bin/rm -f "$out"' EXIT
    statuses=(0 0)
    "$RUNTIME_BINARY" setup "''${args[@]}" "$@" 2>&1 | ${coreutils}/bin/tee "$out" || statuses=("''${PIPESTATUS[@]}")
    code="''${statuses[0]}"
    if [ "''${statuses[1]}" -ne 0 ]; then
      echo 'Could not capture setup output; completion was not verified.' >&2
      [ "$code" -ne 0 ] || code="''${statuses[1]}"
      exit "$code"
    fi
    # Do not reinterpret success, invalid arguments, missing input or cancellation.
    if [ "$code" -ne 1 ]; then
      exit "$code"
    fi
    platform="$("$RUNTIME_BINARY" settings get tv.platform 2>/dev/null)" || platform=
    if [ "$platform" = "bscpylgtv" ]; then
      echo "This configuration selects the legacy bscpylgtv backend, which is not included in this package." >&2
      echo "Turn on the TV and run 'lg-buddy settings set tv.platform lg_webos' as the desktop user in the same configuration environment." >&2
      echo "Approve any on-TV pairing request, then rerun lg-buddy-configure. Keep the old key file for rollback." >&2
    elif [ "$platform" = "lg_webos" ] \
      && ${gnugrep}/bin/grep -Fxq 'LG Buddy: Service setup incomplete: This installation does not support automatic service setup.' "$out" \
      && ${gnugrep}/bin/grep -Fxq 'Details: declaratively managed or immutable system' "$out"; then
      echo "TV pairing is configured and the native credential passed local validation."
      echo "Automatic service installation was skipped; service activation was not checked."
      echo "On a fresh NixOS machine, units may have been skipped before the configuration file existed."
      echo "If your NixOS module declares the following units for this TV configuration, start them with:"
      echo "  sudo systemctl start lg-buddy.service lg-buddy-lifecycle.service"
      echo "Alternatively, reboot after enabling these services in your NixOS configuration."
      echo "Optional manual TV check: lg-buddy brightness get"
      exit 0
    fi
    exit "$code"
    FORWARDER
    chmod 755 $out/bin/lg-buddy-configure
    patchShebangs $out/bin/lg-buddy-configure

    # Upstream renamed LG_Buddy_Brightness.desktop to io.github.staphylococcus.LGBuddy.desktop in 1.5.x.
    if [ -f io.github.staphylococcus.LGBuddy.desktop ]; then
      install -Dm644 io.github.staphylococcus.LGBuddy.desktop $out/share/applications/io.github.staphylococcus.LGBuddy.desktop
      substituteInPlace $out/share/applications/io.github.staphylococcus.LGBuddy.desktop \
        --replace-fail /usr/bin/lg-buddy $out/bin/lg-buddy
    else
      install -Dm644 LG_Buddy_Brightness.desktop $out/share/applications/LG_Buddy_Brightness.desktop
      substituteInPlace $out/share/applications/LG_Buddy_Brightness.desktop \
        --replace-fail /usr/bin/lg-buddy $out/bin/lg-buddy
    fi

    if [ -f data/icons/hicolor/scalable/apps/io.github.staphylococcus.LGBuddy.svg ]; then
      install -Dm644 data/icons/hicolor/scalable/apps/io.github.staphylococcus.LGBuddy.svg $out/share/icons/hicolor/scalable/apps/io.github.staphylococcus.LGBuddy.svg
    fi

    wrapProgram $out/bin/lg-buddy \
      --set-default LG_BUDDY_SYSTEMCTL ${systemd}/bin/systemctl \
      --set-default LG_BUDDY_JOURNALCTL ${systemd}/bin/journalctl \
      --set-default LG_BUDDY_NM_ONLINE ${networkmanager}/bin/nm-online
  '';

  # Exercise the installed shell entry point without any caller-provided tools.
  # Help exits before opening setup, so this needs no session, services or TV.
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    ${coreutils}/bin/env -i \
      HOME="$TMPDIR" PATH="$TMPDIR/no-tools" \
      LG_BUDDY_CONFIG="$TMPDIR/lg-buddy-install-check/config.env" \
      $out/bin/lg-buddy-configure --help > /dev/null
    runHook postInstallCheck
  '';

  meta = with lib; {
    description = "Linux daemon that makes an LG WebOS TV behave like a monitor";
    homepage = "https://github.com/Staphylococcus/LG_Buddy";
    license = licenses.gpl3Only;
    maintainers = [ ];
    mainProgram = "lg-buddy";
    platforms = platforms.linux;
  };
}
