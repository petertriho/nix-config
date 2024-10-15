{
  inputs,
  outputs,
  pkgs,
  config,
  ...
}:
{
  imports = [
    (with inputs.home-manager; if pkgs.stdenv.isLinux then nixosModules else darwinModules).home-manager
  ];

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.${config.user} = import ../../home/${config.networking.hostName}.nix;
    extraSpecialArgs = {
      inherit inputs outputs;
    };
  };
}
