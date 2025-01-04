{
  description = "Nix Config";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-24.05";
    nixos-wsl.url = "github:nix-community/nixos-wsl";
    nixos-hardware.url = "github:NixOS/nixos-hardware";
    nix-darwin = {
      url = "github:LnL7/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    hyprland.url = "github:hyprwm/Hyprland";
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
    in
    {
      overlays = import ./overlays { inherit inputs; };
      systemModules = import ./modules/system;
      homeManagerModules = import ./modules/home-manager;

      options = {
        user = "peter";
      };

      nixosConfigurations = {
        WSL = nixpkgs.lib.nixosSystem (
          getSystemConfiguration "x86_64-linux"
          // {
            modules = [ ./systems/nixos/WSL.nix ];
          }
        );
        X1-NANO = nixpkgs.lib.nixosSystem (
          getSystemConfiguration "x86_64-linux"
          // {
            modules = [ ./systems/nixos/X1-NANO ];
          }
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
