{
  inputs,
  outputs,
  config,
  lib,
  pkgs,
  ...
}: {
  imports = [
    ../common
    inputs.nixos-wsl.nixosModules.wsl
  ];

  wsl = {
    enable = true;
    defaultUser = "peter";
  };
  networking.hostName = "wsl";

  # NOTE: Docker Desktop https://github.com/nix-community/NixOS-WSL/issues/235#issuecomment-1937424376
  wsl = {
    docker-desktop.enable = false;
    extraBin = with pkgs; [
      {src = "${coreutils}/bin/mkdir";}
      {src = "${coreutils}/bin/cat";}
      {src = "${coreutils}/bin/whoami";}
      {src = "${coreutils}/bin/ls";}
      {src = "${busybox}/bin/addgroup";}
      {src = "${su}/bin/groupadd";}
      {src = "${su}/bin/usermod";}
    ];
  };
  virtualisation.docker = {
    enable = true;
    enableOnBoot = true;
    autoPrune.enable = true;
  };
  systemd.services.docker-desktop-proxy.script = lib.mkForce ''${config.wsl.wslConf.automount.root}/wsl/docker-desktop/docker-desktop-user-distro proxy --docker-desktop-root ${config.wsl.wslConf.automount.root}/wsl/docker-desktop "C:\Program Files\Docker\Docker\resources"'';

  system.stateVersion = "24.05";
}
