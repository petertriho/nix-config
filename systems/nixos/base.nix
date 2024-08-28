{
  inputs,
  pkgs,
  lib,
  ...
}:
{
  imports = [
    inputs.home-manager.nixosModules.home-manager
    ../base.nix
  ];

  nix.settings.trusted-users = [
    "root"
    "@wheel"
  ];

  programs.bash = {
    interactiveShellInit =
      # sh
      ''
        if [[ $(${pkgs.procps}/bin/ps --no-header --pid=$PPID --format=comm) != "fish" && -z ''${BASH_EXECUTION_STRING} ]]
         then
           shopt -q login_shell && LOGIN_OPTION='--login' || LOGIN_OPTION=""
           exec ${pkgs.fish}/bin/fish $LOGIN_OPTION
        fi
      '';
  };

  users.users.peter = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
  };

  system.stateVersion = lib.mkDefault "24.05";
}
