{ inputs, ... }:
(import ../pkgs/package-sets.nix { inherit inputs; }).overlays
