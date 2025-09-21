{ config, ... }:
{
  networking.networkmanager.enable = true;
  users.users.${config.user} = {
    extraGroups = [ "networkmanager" ];
  };
}
