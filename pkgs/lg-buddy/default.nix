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
  version = "1.4.0-unstable-2026-09-02";

  src = fetchFromGitHub {
    owner = "Staphylococcus";
    repo = "LG_Buddy";
    rev = "e247d23a98bbde5c2b0ea39f2bfe19ec18959de1";
    hash = "sha256-qT06pIMD6gn7NAv4iLyOvvXIeSPxngyg8H+Wzt9Qn5E=";
  };

  cargoHash = "sha256-xjpHvqo/BojoxVHUkmfo8AwSObM112wYuszn1V5StIA=";

  nativeBuildInputs = [ makeWrapper ];

  cargoBuildFlags = [
    "-p"
    "lg-buddy"
  ];

  doCheck = false;

  postInstall = ''
    install -Dm755 ${./lg-buddy-configure} $out/bin/lg-buddy-configure
    patchShebangs $out/bin/lg-buddy-configure

    install -Dm644 LG_Buddy_Brightness.desktop $out/share/applications/LG_Buddy_Brightness.desktop
    substituteInPlace $out/share/applications/LG_Buddy_Brightness.desktop \
      --replace-fail /usr/bin/lg-buddy $out/bin/lg-buddy

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
