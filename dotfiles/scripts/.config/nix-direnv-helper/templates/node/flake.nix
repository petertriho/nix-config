{
  description = "Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    multiverse.url = "github:fzakaria/nixpkgs-multiverse";
  };

  outputs =
    {
      self,
      nixpkgs,
      multiverse,
    }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forEachSupportedSystem =
        f:
        nixpkgs.lib.genAttrs supportedSystems (
          system:
          f {
            pkgs = import nixpkgs { inherit system; };
            mv = multiverse.multiverse.${system};
          }
        );
    in
    {
      devShells = forEachSupportedSystem (
        { pkgs, mv }:
        let
          # To pin a version, replace the inherit with the fast path, which
          # substitutes the build from cache.nixos.org. List versions with
          # `nix run github:fzakaria/nixpkgs-multiverse#mvs -- query versions nodejs`.
          # nodejs = mv.fast.version "nodejs" "24.21.0";
          inherit (pkgs) nodejs;
        in
        {
          default = pkgs.mkShell {
            packages = [
              nodejs
              pkgs.yarn
            ];
          };
        }
      );
    };
}
