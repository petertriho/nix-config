{ inputs, ... }:
let
  inherit (inputs) nixpkgs nixpkgs-stable nixpkgs-unstable;

  supportedSystems = [
    "x86_64-linux"
    "aarch64-linux"
    "x86_64-darwin"
    "aarch64-darwin"
  ];

  nixpkgsConfig = {
    allowUnfree = true;
    allowBroken = true;
  };

  stableFor =
    system:
    import nixpkgs-stable {
      inherit system;
      config = nixpkgsConfig;
    };

  unstableFor =
    system:
    import nixpkgs-unstable {
      inherit system;
      config = nixpkgsConfig;
    };

  customPackages =
    pkgs:
    import ./default.nix {
      inherit pkgs inputs;
      stablePkgs = stableFor pkgs.stdenv.hostPlatform.system;
    };

  customPluginPackages = pkgs: {
    fish-plugins = import ./fish-plugins { inherit pkgs; };
    tmux-plugins = import ./tmux-plugins { inherit pkgs; };
  };

  overlays = {
    additions =
      final: prev:
      customPackages final
      // {
        fishPlugins = (prev.fishPlugins or { }) // import ./fish-plugins { pkgs = final; };
        tmuxPlugins = (prev.tmuxPlugins or { }) // import ./tmux-plugins { pkgs = final; };
        mcp-servers = inputs.mcp-servers-nix.packages.${final.stdenv.hostPlatform.system};
        llm-agents = inputs.llm-agents.packages.${final.stdenv.hostPlatform.system};
        nix-auth = inputs.nix-auth.packages.${final.stdenv.hostPlatform.system}.default;
      };

    modifications = final: prev: {
      # commitmsgfmt = prev.commitmsgfmt.overrideAttrs (_: {
      #   doCheck = false;
      # });
      # direnv =
      #   if final.stdenv.hostPlatform.isDarwin then
      #     prev.direnv.overrideAttrs (_: {
      #       doCheck = false;
      #     })
      #   else
      #     prev.direnv;
      pythonPackagesExtensions = prev.pythonPackagesExtensions or [ ] ++ [
        (_final: prev': {
          # libtmux = prev'.libtmux.overridePythonAttrs (old: {
          #   disabledTests =
          #     (old.disabledTests or [ ])
          #     ++ final.lib.optionals final.stdenv.hostPlatform.isDarwin [
          #       # Nix's wrapped sleep is identified as coreutils by tmux on Darwin.
          #       "test_break_pane_no_name_uses_natural_name"
          #     ];
          # });
          # mpv = prev'.mpv.overridePythonAttrs (_: {
          #   # Tests spin up a real mpv that needs a writable fontconfig
          #   # cache, which the Nix sandbox does not provide.
          #   doCheck = false;
          # });
          ssort = prev'.ssort.overridePythonAttrs (old: {
            postPatch = (old.postPatch or "") + ''
              python scripts/freeze_version.py ${old.version}
            '';
          });
        })
      ];
      # pylint = prev.python3Packages.pylint.overridePythonAttrs {
      #   dependencies = prev.python3Packages.pylint.dependencies ++ [ prev.python3Packages.pylint-venv ];
      # };
      tokscale = prev.tokscale.overrideAttrs (old: {
        checkFlags = (old.checkFlags or [ ]) ++ [
          "--skip=usage_reset_button_renders_when_credit_available"
        ];
      });
      # # The unstable Darwin toolchain crashes while linking these packages.
      # starship =
      #   if final.stdenv.hostPlatform.isDarwin then
      #     prev.starship.override { rustPlatform = final.stable.rustPlatform; }
      #   else
      #     prev.starship;
      # unar = if final.stdenv.hostPlatform.isDarwin then final.stable.unar else prev.unar;
      # watchexec = if final.stdenv.hostPlatform.isDarwin then final.stable.watchexec else prev.watchexec;
    };

    stable = final: prev: {
      stable = stableFor final.stdenv.hostPlatform.system;
    };

    unstable = final: prev: {
      unstable = unstableFor final.stdenv.hostPlatform.system;
    };
  };

  overlayList = with overlays; [
    additions
    modifications
    stable
    unstable
  ];

  pkgsFor =
    system:
    import nixpkgs {
      inherit system;
      config = nixpkgsConfig;
      overlays = overlayList;
    };

  packagesFor =
    system:
    let
      pkgs = pkgsFor system;
    in
    customPackages pkgs // customPluginPackages pkgs;
in
{
  inherit
    supportedSystems
    nixpkgsConfig
    overlays
    overlayList
    stableFor
    unstableFor
    pkgsFor
    packagesFor
    ;
}
