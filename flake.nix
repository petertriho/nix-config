{
  description = "Nix Config";

  nixConfig = {
    extra-experimental-features = [
      "nix-command"
      "flakes"
    ];
    extra-substituters = [
      "https://nix-community.cachix.org"
    ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-25.05";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
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
      };

      darwinConfigurations = {
        MBP14-M1 = nix-darwin.lib.darwinSystem (
          getSystemConfiguration "aarch64-darwin"
          // {
            modules = [ ./systems/darwin/MBP14-M1.nix ];
          }
        );
      };

      homeConfigurations = {
        droid = home-manager.lib.homeManagerConfiguration {
          pkgs = import nixpkgs {
            system = "aarch64-linux";
            overlays = with outputs.overlays; [
              additions
              modifications
              stable
              unstable
            ];
            config = {
              allowUnfree = true;
            };
          };
          extraSpecialArgs = {
            inherit
              inputs
              outputs
              ;
            user = "droid";
            homePath = "/home/droid";
          };
          modules = [
            ./home/droid.nix
          ];
        };
      };
    };
}
