{
  inputs,
  outputs,
  config,
  pkgs,
  lib,
  ...
}:
{
  imports = [
    inputs.home-manager.darwinModules.home-manager
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

  users.users.peter = {
    home = "/Users/peter";
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

  system.configurationRevision = outputs.rev or outputs.dirtyRev or null;
  system.stateVersion = lib.mkDefault 4;
}
