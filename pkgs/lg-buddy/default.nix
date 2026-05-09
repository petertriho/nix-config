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
  version = "0-unstable-2026-05-09";

  src = fetchFromGitHub {
    owner = "Staphylococcus";
    repo = "LG_Buddy";
    rev = "a71980f84f8ae8abd5b8bc6fc4a40d4c2e400b5e";
    hash = "sha256-KJJm5t61YJCnUAWsGegWkfdXMkTmjvZ1rgAJb5glaic=";
  };

  cargoHash = "sha256-FfoOPTiii+aBthRvuR/Ddjy+SmGY53CsLt9UGMHiCic=";

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
