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
        {
          default = pkgs.mkShell {
            # To pin a package version, use (mv.fast.version "<attr>" "<version>").
            packages = [ ];
          };
        }
      );
    };
}
