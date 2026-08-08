{
  lib,
  pkgs,
  inputs,
  ...
}:
let
  # niri-flake's internal `make-niri` (both the pinned rev and current main)
  # still asserts `libdisplay-info_0_2.version == "0.2.0"` and links the now-removed
  # `libdisplay-info_0_2`. But upstream niri itself requires libdisplay-info 0.3
  # (its Cargo.lock pins the `libdisplay-info` 0.3.0 Rust crate; see niri-wm/niri#4366).
  # The stale assert lives inside the flake's internal make-niri, which isn't
  # exposed, so it can't be dropped via an overlay. Rebuild `niri-unstable` ourselves
  # against `libdisplay-info_0_3` (exact 0.3.0 match in current nixpkgs) without the
  # assert. Drop this override once niri-flake ships the fix (unmerged PR
  # sodiboo/niri-flake#1850).
  niri-src = inputs.niri.inputs.niri-unstable;

  fmt-date =
    raw:
    "${builtins.substring 0 4 raw}-${builtins.substring 4 2 raw}-${builtins.substring 6 2 raw}";
  niri-version = "unstable-${fmt-date niri-src.lastModifiedDate}-${niri-src.shortRev}";
  niri-version-string = "unstable ${fmt-date niri-src.lastModifiedDate} (commit ${niri-src.rev})";

  makeNiriUnstable =
    final:
    final.rustPlatform.buildRustPackage {
      pname = "niri";
      version = niri-version;
      src = niri-src;

      cargoLock = {
        lockFile = "${niri-src}/Cargo.lock";
        allowBuiltinFetchGit = true;
      };

      nativeBuildInputs = with final; [
        pkg-config
        rustPlatform.bindgenHook
        installShellFiles
      ];

      buildInputs =
        with final;
        [
          wayland
          libgbm
          libglvnd
          seatd
          libinput
          libxkbcommon
          pango
          pipewire # withScreencastSupport = true
          systemdLibs # withSystemd = true
        ]
        ++ [ (final.libdisplay-info_0_3 or final.libdisplay-info) ];

      buildNoDefaultFeatures = true;
      buildFeatures = [
        "dbus"
        "xdp-gnome-screencast"
        "systemd"
      ];

      checkFlags = [ "--skip=::egl" ];

      passthru.providedSessions = [ "niri" ];

      # keep backtraces readable
      dontStrip = true;
      RUSTFLAGS = [
        "-C link-arg=-Wl,--push-state,--no-as-needed"
        "-C link-arg=-lEGL"
        "-C link-arg=-lwayland-client"
        "-C link-arg=-Wl,--pop-state"
        "-C debuginfo=line-tables-only"
      ];
      NIRI_BUILD_VERSION_STRING = niri-version-string;

      outputs = [
        "out"
        "doc"
      ];

      postPatch = ''
        export RUSTFLAGS="$RUSTFLAGS --remap-path-prefix $NIX_BUILD_TOP=/"
        export RUSTFLAGS="$RUSTFLAGS --remap-path-prefix $NIX_BUILD_TOP/source=./"
        patchShebangs resources/niri-session
      '';

      postInstall = ''
        install -Dm0755 resources/niri-session -t $out/bin
        install -Dm0644 resources/niri.desktop -t $out/share/wayland-sessions
        install -Dm0644 resources/niri-portals.conf -t $out/share/xdg-desktop-portal
        install -Dm0644 resources/niri{-shutdown.target,.service} -t $out/lib/systemd/user

        installShellCompletion --cmd niri \
          --bash <($out/bin/niri completions bash) \
          --zsh <($out/bin/niri completions zsh) \
          --fish <($out/bin/niri completions fish) \
          --nushell <($out/bin/niri completions nushell)

        install -Dm0644 README.md resources/default-config.kdl -t $doc/share/doc/niri
        mv docs/wiki $doc/share/doc/niri/wiki
      '';

      postFixup = ''
        substituteInPlace $out/lib/systemd/user/niri.service --replace-fail "ExecStart=niri" "ExecStart=$out/bin/niri"
      '';

      meta = with final.lib; {
        description = "Scrollable-tiling Wayland compositor";
        homepage = "https://github.com/YaLTeR/niri";
        license = licenses.gpl3Only;
        mainProgram = "niri";
        platforms = platforms.linux;
      };
    };
in
{
  nixpkgs.overlays = [
    inputs.niri.overlays.niri
    (final: _prev: {
      niri-unstable = makeNiriUnstable final;
    })
  ];

  programs.niri = {
    enable = true;
    package = pkgs.niri-unstable;
  };

  xdg.portal = {
    enable = true;
    config.niri = {
      default = lib.mkForce [ "gtk" ];
      "org.freedesktop.impl.portal.Access" = lib.mkForce [ "gtk" ];
      "org.freedesktop.impl.portal.Notification" = lib.mkForce [ "gtk" ];
      "org.freedesktop.impl.portal.Settings" = lib.mkForce [ "gtk" ];
      "org.freedesktop.impl.portal.Secret" = lib.mkForce [ "gnome-keyring" ];
    };
    extraPortals = lib.mkForce [
      pkgs.xdg-desktop-portal-gtk
      pkgs.gnome-keyring
    ];
  };

  security.pam.services.hyprlock = { };
}
