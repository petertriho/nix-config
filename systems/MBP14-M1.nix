{
  inputs,
  outputs,
  config,
  pkgs,
  pkgs-stable,
  ...
}:
{
  imports = [ inputs.home-manager.darwinModules.home-manager ];

  networking.hostName = "MBP14-M1";

  users.users.peter = {
    name = "peter";
    home = "/Users/peter";
  };

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.peter = import ../home/${config.networking.hostName}.nix;
    extraSpecialArgs = {
      inherit inputs outputs pkgs-stable;
    };
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

  # List packages installed in system profile. To search by name, run:
  # $ nix-env -qaP | grep wget
  environment.systemPackages = [
    pkgs.vim
  ];

  # Auto upgrade nix package and the daemon service.
  services.nix-daemon.enable = true;
  # nix.package = pkgs.nix;

  # Necessary for using flakes on this system.
  nix.settings.experimental-features = "nix-command flakes";

  # Create /etc/zshrc that loads the nix-darwin environment.
  programs.zsh.enable = true; # default shell on catalina
  # programs.fish.enable = true;

  # Set Git commit hash for darwin-version.
  system.configurationRevision = outputs.rev or outputs.dirtyRev or null;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 4;

  # The platform the configuration will be used on.
  # nixpkgs.hostPlatform = "aarch64-darwin";
}
