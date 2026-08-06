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
      extraEnv = {
        HOMEBREW_DOWNLOAD_CONCURRENCY = "auto";
        HOMEBREW_NO_ANALYTICS = "1";
        HOMEBREW_NO_ASK = "1";
        HOMEBREW_NO_REQUIRE_TAP_TRUST = "1";
      };
    };
    taps = [
      "gromgit/brewtils"
      "nikitabobko/tap"
      "steipete/tap"
      "TabularisDB/tabularis"
    ];
    brews = [
      "gromgit/brewtils/taproom"
      "mas"
      "mole"
      "terminal-notifier"
    ];
    casks = [
      # "aionui"
      # "alacritty"
      "appcleaner"
      # "codex-app"
      "cyberduck"
      "displaylink"
      # "doll"
      "easy-move+resize"
      "firefox"
      "floorp"
      "font-jetbrains-mono-nerd-font"
      "ghostty"
      "google-chrome"
      "helium-browser"
      "iina"
      "keepingyouawake"
      "keka"
      "keyboardcleantool"
      "meetingbar"
      "nextcloud"
      "nikitabobko/tap/aerospace"
      "notunes"
      "obsidian"
      "orbstack"
      "raycast"
      "reminders-menubar"
      "steipete/tap/codexbar"
      "TabularisDB/tabularis/tabularis"
      # "wezterm"
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
      # "thaw"
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
      HOMEBREW_DOWNLOAD_CONCURRENCY = "auto";
      HOMEBREW_NO_ANALYTICS = "1";
      HOMEBREW_NO_ASK = "1";
      HOMEBREW_NO_REQUIRE_TAP_TRUST = "1";
    };
    systemPath = [
      "${HOMEBREW_PREFIX}/bin"
      "${HOMEBREW_PREFIX}/sbin"
    ];
  };
}
