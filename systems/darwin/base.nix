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
    inputs.stylix.darwinModules.stylix
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

  # Workaround: nixpkgs dropped `--toc-depth` from `nixos-render-docs`
  # (renamed to `--sidebar-depth`), but nix-darwin's `darwin-manual-html`
  # still passes the old flag, breaking the build. Disable HTML manual
  # generation (both entry points) until nix-darwin catches up.
  # See: https://github.com/nix-darwin/nix-darwin/issues/1819
  documentation.doc.enable = false;
  system.tools.darwin-uninstaller.enable = false;

  services.kanata = {
    enable = true;
  };

  system = {
    primaryUser = config.user;
    configurationRevision = outputs.rev or outputs.dirtyRev or null;
    stateVersion = lib.mkDefault 5;
  };
}
