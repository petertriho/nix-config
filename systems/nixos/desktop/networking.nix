{ config, ... }:
{
  # connect using nmcli/nmtui
  networking.networkmanager.enable = true;
  users.users.${config.user} = {
    extraGroups = [ "networkmanager" ];
  };
}
