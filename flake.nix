{
  description = "Nix Config";

  nixConfig = {
    extra-experimental-features = [
      "nix-command"
      "flakes"
    ];
    extra-substituters = [
      "https://niri.cachix.org"
      "https://nix-community.cachix.org"
      "https://vicinae.cachix.org"
      "https://cache.numtide.com"
    ];
    extra-trusted-public-keys = [
      "niri.cachix.org-1:Wv0OmO7PsuocRKzfDoJ3mulSl7Z6oezYhGhR+3W2964="
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      "vicinae.cachix.org-1:1kDrfienkGHPYbkpNj1mWTr7Fm1+zcenzgTizIcI3oc="
      "niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g="
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    stylix = {
      url = "github:nix-community/stylix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-26.05";
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
    neovim-nightly-overlay.url = "github:nix-community/neovim-nightly-overlay";
    niri.url = "github:sodiboo/niri-flake";
    vicinae.url = "github:vicinaehq/vicinae";
    mcp-servers-nix.url = "github:natsukium/mcp-servers-nix";
    llm-agents.url = "github:numtide/llm-agents.nix";
    nix-auth.url = "github:numtide/nix-auth";
    # nix-flatpak.url = "github:gmodena/nix-flatpak";
    pyproject-nix.url = "github:pyproject-nix/pyproject.nix";
    pyproject-nix.inputs.nixpkgs.follows = "nixpkgs";
    uv2nix = {
      url = "github:pyproject-nix/uv2nix";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    pyproject-build-systems = {
      url = "github:pyproject-nix/build-system-pkgs";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.uv2nix.follows = "uv2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      self,
      nixpkgs,
      nixos-wsl,
      nix-darwin,
      home-manager,
      ...
    }:
    let
      inherit (self) outputs;
      lib = nixpkgs.lib;
      packageSets = import ./pkgs/package-sets.nix { inherit inputs; };
      hostRegistry = import ./host-registry.nix { inherit lib; };
      hostsForOutput = hostRegistry.hostsForOutput;

      hostSystemModule = host: {
        user = lib.mkForce host.user;
        homePath = lib.mkForce host.homePath;
        networking.hostName = lib.mkForce host.name;
      };

      getSystemConfiguration = host: {
        inherit (host) system;
        specialArgs = {
          inherit
            inputs
            outputs
            host
            ;
          inherit (host) homeModule;
        };
        modules = [
          (hostSystemModule host)
          host.systemModule
        ];
      };

      getHomeConfiguration =
        host:
        home-manager.lib.homeManagerConfiguration {
          pkgs = packageSets.pkgsFor host.system;
          extraSpecialArgs = {
            inherit
              inputs
              outputs
              host
              ;
            inherit (host) user homePath;
          };
          modules = [
            host.homeModule
          ];
        };
    in
    {
      inherit packageSets;

      overlays = packageSets.overlays;
      systemModules = import ./modules/system;
      homeManagerModules = import ./modules/home-manager;
      activationTargets = hostRegistry.activationTargets;

      # Expose packages for nix-update
      packages = nixpkgs.lib.genAttrs packageSets.supportedSystems packageSets.packagesFor;

      options = {
        user = "peter";
      };

      nixosConfigurations = lib.mapAttrs (
        _: host: nixpkgs.lib.nixosSystem (getSystemConfiguration host)
      ) (hostsForOutput "nixosConfigurations");

      darwinConfigurations = lib.mapAttrs (
        _: host: nix-darwin.lib.darwinSystem (getSystemConfiguration host)
      ) (hostsForOutput "darwinConfigurations");

      homeConfigurations = lib.mapAttrs (_: host: getHomeConfiguration host) (
        hostsForOutput "homeConfigurations"
      );
    };
}
