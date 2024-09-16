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
    ./modules/homebrew.nix
    ./modules/system.nix
  ];

  nix.gc.interval = [
    {
      Weekday = 1;
    }
  ];

  services.nix-daemon.enable = true;
  nix.package = pkgs.nix;
  nix.settings.auto-optimise-store = false;

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
