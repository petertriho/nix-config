{
  pkgs,
  config,
  ...
}:
let
  HOMEBREW_PREFIX = if pkgs.stdenv.isAarch64 then "/opt/homebrew" else "/usr/local";
in
{
  system.activationScripts.preActivation.text =
    # sh
    ''
      if ! xcode-select --version 2>/dev/null; then
        $DRY_RUN_CMD xcode-select --install
      fi
      if ! [ -f "${HOMEBREW_PREFIX}/bin/brew" ]; then
        $DRY_RUN_CMD sudo su ${config.user} -c "NONINTERACTIVE=1 /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      fi
    '';

  homebrew = {
    enable = true;
    global = {
      autoUpdate = true;
    };
    onActivation = {
      # autoUpdate = true;
      cleanup = "zap";
      # upgrade = true;
    };
    taps = [
      "nikitabobko/tap"
    ];
    brews = [
      "mas"
    ];
    casks = [
      "aerospace"
      "alacritty"
      "appcleaner"
      "cyberduck"
      "displaylink"
      "doll"
      "easy-move+resize"
      "firefox"
      "floorp"
      "font-jetbrains-mono-nerd-font"
      "google-chrome"
      "iina"
      "keepingyouawake"
      "keka"
      "keyboardcleantool"
      "meetingbar"
      "nextcloud"
      "notunes"
      "orbstack"
      "raycast"
      "wezterm"
      # "airbuddy"
      # "badgeify"
      # "bartender"
      # "betterdisplay"
      # "cursorsense"
      # "istat-menus"
      # "itsycal"
      # "jordanbaird-ice"
      # "kindavim"
      # "rectangle"
      # "scrolla"
      # "stats"
      # "steermouse"
      # "swish"
      # "vlc"
      # "wooshy"
    ]
    ++ (
      if pkgs.stdenv.isAarch64 then
        [
          "battery"
        ]
      else
        [
          "aldente"
        ]
    );
  };

  environment = {
    variables = {
      inherit HOMEBREW_PREFIX;
      HOMEBREW_CELLAR = "${HOMEBREW_PREFIX}/Cellar";
      HOMEBREW_REPOSITORY = HOMEBREW_PREFIX;
      HOMEBREW_NO_ANALYTICS = "1";
    };
    systemPath = [
      "${HOMEBREW_PREFIX}/bin"
      "${HOMEBREW_PREFIX}/sbin"
    ];
  };
}
