{
  outputs,
  config,
  pkgs,
  lib,
  ...
}:
{
  imports = [
    ../base.nix
  ];

  nix.gc.interval = [
    {
      Weekday = 1;
    }
  ];

  services.nix-daemon.enable = true;
  nix.package = pkgs.nix;

  programs.zsh = {
    enable = true;
    interactiveShellInit = config.lib.meta.interactiveShellInit pkgs;
  };

  users.users.${config.user} = {
    home = config.homePath;
  };

  homebrew = {
    enable = true;
    onActivation = {
      cleanup = "zap";
    };
    taps = [
      "homebrew/bundle"
    ];
    brews = [
      "mas"
    ];
    casks = [
      # "airbuddy"
      "aldente"
      "appcleaner"
      # "bartender"
      # "betterdisplay"
      # "cursorsense"
      "cyberduck"
      "docker"
      "easy-move+resize"
      "firefox"
      "font-jetbrains-mono-nerd-font"
      "google-chrome"
      # "istat-menus"
      "karabiner-elements"
      "keepingyouawake"
      "keka"
      "keyboardcleantool"
      "meetingbar"
      "nextcloud"
      "rectangle"
      # "steermouse"
      # "swish"
      "vlc"
      "wezterm"
    ];
  };

  environment =
    let
      HOMEBREW_PREFIX = if pkgs.stdenv.isAarch64 then "/opt/homebrew" else "/usr/local";
    in
    {
      variables = {
        inherit HOMEBREW_PREFIX;
        HOMEBREW_CELLAR = "${HOMEBREW_PREFIX}/Cellar";
        HOMEBREW_REPOSITORY = HOMEBREW_PREFIX;
        HOMEBREW_NO_ANALYTICS = "1";
      };
      systemPath = [
        "${HOMEBREW_PREFIX}/bin"
        "${HOMEBREW_PREFIX}/homebrew/sbin"
      ];
    };

  system = {
    defaults = {
      LaunchServices = {
        LSQuarantine = false;
      };
      NSGlobalDomain = {
        "com.apple.mouse.tapBehavior" = 1;
        "com.apple.sound.beep.feedback" = 0;
        "com.apple.sound.beep.volume" = 0.0;
        ApplePressAndHoldEnabled = false;
        AppleShowAllExtensions = true;
        AppleShowAllFiles = true;
        InitialKeyRepeat = 15;
        KeyRepeat = 2;
        NSAutomaticCapitalizationEnabled = false;
        NSAutomaticDashSubstitutionEnabled = false;
        NSAutomaticPeriodSubstitutionEnabled = false;
        NSAutomaticQuoteSubstitutionEnabled = false;
        NSAutomaticSpellingCorrectionEnabled = false;
        NSDocumentSaveNewDocumentsToCloud = false;
        NSWindowShouldDragOnGesture = true;
      };
      dock = {
        autohide = true;
        autohide-time-modifier = 0.1;
        mineffect = "scale";
        mru-spaces = false;
        show-recents = false;
        tilesize = 48;
        # persistent-apps = [];
        # persistent-others = [];
      };
      finder = {
        _FXShowPosixPathInTitle = false;
        QuitMenuItem = true;
      };
    };
    keyboard = {
      enableKeyMapping = true;
      remapCapsLockToControl = true;
    };
    configurationRevision = outputs.rev or outputs.dirtyRev or null;
    stateVersion = lib.mkDefault 4;
  };
}
