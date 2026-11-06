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
          # To pin a version, replace pkgs.python3 with the eval path. The fast
          # path (mv.fast.version) has no package set for venvShellHook. List
          # versions with
          # `nix run github:fzakaria/nixpkgs-multiverse#mvs -- query versions python3`.
          # python = mv.version "python3" "3.14.8";
          python = pkgs.python3;
        in
        {
          default = pkgs.mkShell {
            packages = [
              python
              python.pkgs.pip
              python.pkgs.venvShellHook
              pkgs.uv
            ];
            venvDir = ".venv";
          };
        }
      );
    };
}
