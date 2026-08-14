{
  outputs,
  pkgs,
  ...
}:
{
  imports = [
    ./environment.nix
    ./home-manager.nix
    ./options.nix
    ./stylix.nix
    outputs.systemModules.shells
  ];

  nix = {
    gc = {
      automatic = true;
      options = "--delete-older-than 30d";
    };
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
      ];
      warn-dirty = false;
      trusted-users = [
        "root"
        (if pkgs.stdenv.hostPlatform.isLinux then "@wheel" else "@admin")
      ];

      # Deliberately duplicated with flake.nix's nixConfig, which covers fresh
      # clones and `nix run` against this flake. That path is advisory: nix keys
      # the accept-flake-config decision on the exact whole setting string, so
      # editing the list invalidates any prior acceptance recorded in
      # ~/.local/share/nix/trusted-settings.json and the caches go silently
      # unused until re-accepted. Declaring them here writes them straight into
      # nix.conf, so activated systems get them unconditionally.
      #
      # Keep both lists in sync with flake.nix. `extra-` prefixes append rather
      # than replace, preserving the cache.nixos.org defaults.
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
        # cache.numtide.com signs as niks3.numtide.com-1 (verified against the
        # Sig field on a narinfo it serves) — the names intentionally differ.
        "niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g="
      ];
    };
  };

  nixpkgs = {
    overlays = outputs.packageSets.overlayList;
    config = outputs.packageSets.nixpkgsConfig;
  };
}
