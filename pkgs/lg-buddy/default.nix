{
  lib,
  rustPlatform,
  fetchFromGitHub,
  fetchPypi,
  python3Packages,
  makeWrapper,
  coreutils,
  gawk,
  gnugrep,
  gnused,
  iproute2,
  iputils,
  libnotify,
  networkmanager,
  openssl,
  systemd,
  zenity,
}:
let
  bscpylgtv = python3Packages.buildPythonApplication rec {
    pname = "bscpylgtv";
    version = "0.5.1";
    format = "setuptools";

    src = fetchPypi {
      inherit pname version;
      hash = "sha256-act/rqkCS/qsGYREeeNsE1FZItaMbniIXlZ4UU/iZA8=";
    };

    propagatedBuildInputs = with python3Packages; [
      sqlitedict
      websockets
    ];

    pythonImportsCheck = [ "bscpylgtv" ];

    meta = with lib; {
      description = "Command-line utilities and library to control webOS based LG TV devices";
      homepage = "https://github.com/chros73/bscpylgtv";
      license = licenses.mit;
      maintainers = [ ];
      mainProgram = "bscpylgtvcommand";
    };
  };

  runtimePath = lib.makeBinPath [
    coreutils
    gawk
    gnugrep
    gnused
    iproute2
    iputils
    libnotify
    openssl
    systemd
    zenity
  ];
in
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
    install -Dm755 ${./lg-buddy-configure} $out/bin/lg-buddy-configure
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
      --set-default LG_BUDDY_BSCPYLGTV_COMMAND ${bscpylgtv}/bin/bscpylgtvcommand \
      --set-default LG_BUDDY_NM_ONLINE ${networkmanager}/bin/nm-online \
      --set-default LG_BUDDY_NOTIFY_SEND ${libnotify}/bin/notify-send \
      --set-default LG_BUDDY_PING ${iputils}/bin/ping \
      --set-default LG_BUDDY_SYSTEMCTL ${systemd}/bin/systemctl \
      --set-default LG_BUDDY_ZENITY ${zenity}/bin/zenity \
      --prefix PATH : ${runtimePath}

    wrapProgram $out/bin/lg-buddy-configure \
      --set-default LG_BUDDY_BSCPYLGTV_COMMAND ${bscpylgtv}/bin/bscpylgtvcommand \
      --prefix PATH : ${runtimePath}
  '';

  passthru = {
    inherit bscpylgtv;
  };

  meta = with lib; {
    description = "Linux daemon that makes an LG WebOS TV behave like a monitor";
    homepage = "https://github.com/Staphylococcus/LG_Buddy";
    license = licenses.gpl3Only;
    maintainers = [ ];
    mainProgram = "lg-buddy";
    platforms = platforms.linux;
  };
}
