{
  inputs,
  outputs,
  config,
  host ? null,
  ...
}:
let
  homeModule =
    if host != null && host ? homeModule then
      host.homeModule
    else
      throw "systems/base/home-manager.nix requires a host registry entry with homeModule";
in
{
  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.${config.user} = import homeModule;
    extraSpecialArgs = {
      inherit inputs outputs host;
      inherit (config) user homePath;
    };
  };
}
