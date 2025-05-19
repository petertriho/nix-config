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
    ../base
    inputs.home-manager.darwinModules.home-manager
    outputs.systemModules.darwin
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

  security.pam.services.sudo_local.touchIdAuth = true;

  security.sudo = {
    extraConfig = ''
      Defaults pwfeedback
      Defaults timestamp_timeout=60
      Defaults timestamp_type=tty
    '';
  };

  users.users.${config.user} = {
    home = config.homePath;
  };

  programs.zsh = {
    enable = true;
  };

  services.kanata = {
    enable = true;
  };

  system = {
    primaryUser = config.user;
    configurationRevision = outputs.rev or outputs.dirtyRev or null;
    stateVersion = lib.mkDefault 5;
  };
}
