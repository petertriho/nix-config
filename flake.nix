{
  description = "Nix Config";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-24.11";
    nixos-wsl.url = "github:nix-community/nixos-wsl";
    nix-darwin = {
      url = "github:LnL7/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    neovim-nightly-overlay.url = "github:nix-community/neovim-nightly-overlay";
  };

  outputs =
    inputs@{
      self,
      nixpkgs,
      nixpkgs-stable,
      nixos-wsl,
      nix-darwin,
      home-manager,
      ...
    }:
    let
      inherit (self) outputs;

      getSystemConfiguration = system: {
        inherit system;
        specialArgs = {
          inherit
            inputs
            outputs
            ;
        };
      };

      forEachSupportedSystem =
        supportedSystems: f: nixpkgs.lib.genAttrs supportedSystems (system: f { inherit system; });
    in
    {
      overlays = import ./overlays { inherit inputs; };
      systemModules = import ./modules/system;
      homeManagerModules = import ./modules/home-manager;

      options = {
        user = "peter";
      };

      nixosConfigurations = {
        WSL =
          forEachSupportedSystem
            [
              "aarch64-linux"
              "x86_64-linux"
            ]
            (
              system:
              nixpkgs.lib.nixosSystem (
                getSystemConfiguration "x86_64-linux"
                // {
                  modules = [ ./systems/nixos/WSL.nix ];
                }
              )
            );
      };

      darwinConfigurations = {
        MBP14-M1 = nix-darwin.lib.darwinSystem (
          getSystemConfiguration "aarch64-darwin"
          // {
            modules = [ ./systems/darwin/MBP14-M1.nix ];
          }
        );
      };
    };
}
