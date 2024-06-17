{
  inputs,
  outputs,
  config,
  pkgs,
  ...
}: {
  imports = [
    inputs.home-manager.nixosModules.home-manager
  ];

  nix.settings.experimental-features = ["nix-command" "flakes"];

  environment = {
    systemPackages = with pkgs; [
      vim
    ];
    variables.EDITOR = "vim";
  };

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.peter = import ../../home/peter/${config.networking.hostName}.nix;
  };
}
