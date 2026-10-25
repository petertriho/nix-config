{
  inputs,
  outputs,
  config,
  pkgs,
  homeModule ? throw "systems/base/home-manager.nix requires a normalized host homeModule",
  host ? null,
  ...
}:
let
  fontProfile = (import ./font-profiles.nix { inherit pkgs; }).${config.font};
in
{
  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.${config.user} = import homeModule;
    extraSpecialArgs = {
      inherit
        inputs
        outputs
        host
        fontProfile
        ;
      inherit (config) user homePath theme;
    };
  };
}
