{ pkgs, ... }:
let
  HOMEBREW_PREFIX = if pkgs.stdenv.isAarch64 then "/opt/homebrew" else "/usr/local";
in
{
  system.activationScripts.installHomebrew.text =
    # sh
    ''
      if ! xcode-select --version 2>/dev/null; then
        $DRY_RUN_CMD xcode-select --install
      fi
      if [-f "${HOMEBREW_PREFIX}/bin/brew" ]; then
        $DRY_RUN_CMD /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      fi
    '';

  homebrew = {
    enable = true;
    onActivation = {
      cleanup = "zap";
    };
    taps = [
      "homebrew/bundle"
      "nikitabobko/tap"
    ];
    brews = [
      "mas"
      "podman"
    ];
    casks = [
      "aerospace"
      "aldente"
      "appcleaner"
      "cyberduck"
      "docker"
      "easy-move+resize"
      "firefox"
      "font-jetbrains-mono-nerd-font"
      "google-chrome"
      "karabiner-elements"
      "keepingyouawake"
      "keka"
      "keyboardcleantool"
      "meetingbar"
      "nextcloud"
      "orbstack"
      "podman-desktop"
      "vlc"
      "wezterm"
      # "airbuddy"
      # "bartender"
      # "betterdisplay"
      # "cursorsense"
      # "istat-menus"
      # "rectangle"
      # "steermouse"
      # "swish"
    ];
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
      "${HOMEBREW_PREFIX}/homebrew/sbin"
    ];
  };
}
