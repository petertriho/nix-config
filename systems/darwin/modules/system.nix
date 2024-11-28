{ config, ... }:
{
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
        NSAutomaticWindowAnimationsEnabled = false;
        NSDocumentSaveNewDocumentsToCloud = false;
        NSWindowShouldDragOnGesture = true;
      };
      dock = {
        autohide = true;
        autohide-time-modifier = 0.1;
        # https://github.com/LnL7/nix-darwin/pull/1189
        # renamed to exposed-group-by-apps
        # expose-group-apps = true;
        mineffect = "scale";
        mru-spaces = false;
        show-recents = false;
        tilesize = 48;
        persistent-apps = [
          "/System/Applications/Launchpad.app"
          "/System/Cryptexes/App/System/Applications/Safari.app"
          "/System/Applications/Mail.app"
          "/System/Applications/Calendar.app"
          "/Applications/Floorp.app"
          "/Applications/WezTerm.app"
        ];
        persistent-others = [
          "${config.homePath}/Downloads"
        ];
      };
      finder = {
        _FXShowPosixPathInTitle = false;
        QuitMenuItem = true;
      };
      spaces = {
        spans-displays = true;
      };
    };
    keyboard = {
      enableKeyMapping = true;
      remapCapsLockToControl = true;
    };
  };
}
