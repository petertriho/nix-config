{
  inputs,
  outputs,
  pkgs,
  lib,
  ...
}:
{
  imports = [
    inputs.home-manager.darwinModules.home-manager
    ../base.nix
  ];

  services.nix-daemon.enable = true;

  programs.zsh = {
    enable = true;
    interactiveShellInit =
      # sh
      ''
        if [[ $(${pkgs.procps}/bin/ps -p $PPID -o "comm=") != "fish" && -z ''${BASH_EXECUTION_STRING} ]]
         then
           case $- in
             *l*)
               LOGIN_OPTION='--login'
               ;;
             *)
               LOGIN_OPTION=""
               ;;
           esac
           exec ${pkgs.fish}/bin/fish $LOGIN_OPTION
        fi
      '';
  };

  users.users.peter = {
    name = "peter";
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
      # "karabiner-elements"
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