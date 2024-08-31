{
  description = "Nix Config";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-24.05";
    nixos-wsl.url = "github:nix-community/nixos-wsl";
    nix-darwin = {
      url = "github:LnL7/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    neovim-nightly-overlay = {
      url = "github:nix-community/neovim-nightly-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
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

      getSystemConfiguration =
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config = {
              allowUnfree = true;
            };
          };
          pkgs-stable = import nixpkgs-stable { inherit system; };
        in
        {
          inherit system;
          specialArgs = {
            inherit
              inputs
              outputs
              pkgs
              pkgs-stable
              ;
          };
        };
    in
    {
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
