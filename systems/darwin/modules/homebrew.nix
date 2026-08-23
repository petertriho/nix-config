{
  pkgs,
  config,
  ...
}:
let
  HOMEBREW_PREFIX = if pkgs.stdenv.hostPlatform.isAarch64 then "/opt/homebrew" else "/usr/local";
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
      # "TabularisDB/tabularis"
    ];
    brews = [
      "gromgit/brewtils/taproom"
      "mas"
      "mole"
      "terminal-notifier"
    ];
    casks = [
      "cyberduck"
      "displaylink"
      "easy-move+resize"
      "firefox"
      "floorp"
      "font-jetbrains-mono-nerd-font"
      "ghostty"
      "google-chrome"
      "helium-browser"
      "iina"
      "keka"
      "meetingbar"
      "nextcloud"
      "nikitabobko/tap/aerospace"
      "obsidian"
      "orbstack"
      "raycast"
      "reminders-menubar"
      "steipete/tap/codexbar"
      # "TabularisDB/tabularis/tabularis"
      # "aionui"
      # "airbuddy"
      # "alacritty"
      # "appcleaner"
      # "badgeify"
      # "bartender"
      # "betterdisplay"
      # "codex-app"
      # "cursorsense"
      # "doll"
      # "istat-menus"
      # "itsycal"
      # "jordanbaird-ice"
      # "keepingyouawake"
      # "keyboardcleantool"
      # "kindavim"
      # "notunes"
      # "rectangle"
      # "scrolla"
      # "stats"
      # "steermouse"
      # "swish"
      # "thaw"
      # "vlc"
      # "wezterm"
      # "wooshy"
    ]
    ++ (
      if pkgs.stdenv.hostPlatform.isAarch64 then
        [
          "battery"
          "vorssaint"
        ]
      else
        [
          "aldente"
          "appcleaner"
          "keepingyouawake"
          "keyboardcleantool"
          "notunes"
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
