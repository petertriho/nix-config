{ config, lib, ... }:
let
  # Use true for Glide or false for AeroSpace, then rebuild to apply the shortcuts.
  enableGlideSpaceShortcuts = false;
in
{
  system = {
    activationScripts.postActivation.text = lib.mkAfter ''
      # Defaults writes do not refresh the shortcuts registered in the login session.
      echo >&2 "activating macOS keyboard shortcuts..."
      launchctl asuser "$(id -u -- ${lib.escapeShellArg config.system.primaryUser})" \
        sudo --user=${lib.escapeShellArg config.system.primaryUser} -- \
        /System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u
    '';
    defaults = {
      # macOS replaces the whole dictionary, so retain unrelated and disabled shortcuts.
      CustomUserPreferences."com.apple.symbolichotkeys".AppleSymbolicHotKeys = {
        "15".enabled = false;
        "16".enabled = false;
        "17".enabled = false;
        "18".enabled = false;
        "19".enabled = false;
        "20".enabled = false;
        "21".enabled = false;
        "22".enabled = false;
        "23".enabled = false;
        "24".enabled = false;
        "25".enabled = false;
        "26".enabled = false;
        "60" = {
          enabled = false;
          value = {
            type = "standard";
            parameters = [
              32
              49
              262144
            ];
          };
        };
        "61" = {
          enabled = false;
          value = {
            type = "standard";
            parameters = [
              32
              49
              786432
            ];
          };
        };
        # Alt+P/N are global and can intercept Option+P/N text composition.
        "79" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              35
              524288
            ];
          };
        };
        "80".enabled = true;
        "81" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              45
              524288
            ];
          };
        };
        "82".enabled = true;
        # Alt+1 through Alt+9 select Spaces 1–9; Alt+0 selects Space 10.
        "118" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              18
              524288
            ];
          };
        };
        "119" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              19
              524288
            ];
          };
        };
        "120" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              20
              524288
            ];
          };
        };
        "121" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              21
              524288
            ];
          };
        };
        "122" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              23
              524288
            ];
          };
        };
        "123" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              22
              524288
            ];
          };
        };
        "124" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              26
              524288
            ];
          };
        };
        "125" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              28
              524288
            ];
          };
        };
        "126" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              25
              524288
            ];
          };
        };
        "127" = {
          enabled = enableGlideSpaceShortcuts;
          value = {
            type = "standard";
            parameters = [
              65535
              29
              524288
            ];
          };
        };
        "164" = {
          enabled = false;
          value = {
            type = "standard";
            parameters = [
              65535
              65535
              0
            ];
          };
        };
      };
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
        expose-group-apps = true;
        mineffect = "scale";
        mru-spaces = false;
        show-recents = false;
        tilesize = 48;
        persistent-apps = [
          "/System/Applications/Apps.app"
          "/System/Cryptexes/App/System/Applications/Safari.app"
          "/System/Applications/Mail.app"
          "/System/Applications/Calendar.app"
          "/Applications/Floorp.app"
          "/Applications/Ghostty.app"
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
        spans-displays = false;
      };
    };
    keyboard = {
      enableKeyMapping = true;
      remapCapsLockToControl = true;
    };
  };
}
