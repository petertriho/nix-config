{
  outputs,
  config,
  pkgs,
  lib,
  ...
}:
{
  imports = [
    ../base
    ./modules/homebrew.nix
    ./modules/system.nix
  ];

  nix = {
    package = pkgs.nix;
    gc.interval = [
      {
        Weekday = 1;
      }
    ];
    settings.auto-optimise-store = false;
  };

  services.nix-daemon.enable = true;

  security.pam.enableSudoTouchIdAuth = true;

  users.users.${config.user} = {
    home = config.homePath;
  };

  programs.zsh = {
    enable = true;
  };

  system = {
    configurationRevision = outputs.rev or outputs.dirtyRev or null;
    stateVersion = lib.mkDefault 4;
  };
}
