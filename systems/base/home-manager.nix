{
  inputs,
  outputs,
  config,
  homeModule ? throw "systems/base/home-manager.nix requires a normalized host homeModule",
  host ? null,
  ...
}:
{
  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.${config.user} = import homeModule;
    extraSpecialArgs = {
      inherit inputs outputs host;
      inherit (config) user homePath theme;
    };
  };
}
