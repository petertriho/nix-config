{
  inputs,
  outputs,
  config,
  ...
}:
{
  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.${config.user} = import ../../home/${config.networking.hostName}.nix;
    extraSpecialArgs = {
      inherit inputs outputs;
      inherit (config) user homePath;
    };
  };
}
