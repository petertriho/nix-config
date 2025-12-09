{
  description = "Nix Config";

  nixConfig = {
    extra-experimental-features = [
      "nix-command"
      "flakes"
    ];
    extra-substituters = [
      "https://hyprland.cachix.org"
      "https://nix-community.cachix.org"
      "https://vicinae.cachix.org"
    ];
    extra-trusted-public-keys = [
      "hyprland.cachix.org-1:a7pgxzMz7+chwVL3/pzj6jIBMioiJM7ypFP8PwtkuGc="
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      "vicinae.cachix.org-1:1kDrfienkGHPYbkpNj1mWTr7Fm1+zcenzgTizIcI3oc="
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-25.05";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
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
    quickshell = {
      url = "github:outfoxxed/quickshell";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    hyprland.url = "github:hyprwm/Hyprland";
    neovim-nightly-overlay.url = "github:nix-community/neovim-nightly-overlay";
    vicinae.url = "github:vicinaehq/vicinae";
    mcp-servers-nix.url = "github:natsukium/mcp-servers-nix";
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

      # Expose packages for nix-update
      packages =
        nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ]
          (
            system:
            import ./pkgs {
              pkgs = import nixpkgs {
                inherit system;
                config.allowUnfree = true;
              };
            }
          );

      options = {
        user = "peter";
      };

      nixosConfigurations = {
        T480 = nixpkgs.lib.nixosSystem (
          getSystemConfiguration "x86_64-linux"
          // {
            modules = [ ./systems/nixos/T480 ];
          }
        );
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
              allowBroken = true;
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
