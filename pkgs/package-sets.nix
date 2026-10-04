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
    pi-extensions = import ./pi-extensions { inherit pkgs; };
    tmux-plugins = import ./tmux-plugins { inherit pkgs; };
  };

  overlays = {
    additions =
      final: prev:
      customPackages final
      // {
        fishPlugins = (prev.fishPlugins or { }) // import ./fish-plugins { pkgs = final; };
        piExtensions = (prev.piExtensions or { }) // import ./pi-extensions { pkgs = final; };
        tmuxPlugins = (prev.tmuxPlugins or { }) // import ./tmux-plugins { pkgs = final; };
        mcp-servers = inputs.mcp-servers-nix.packages.${final.stdenv.hostPlatform.system};
        llm-agents = inputs.llm-agents.packages.${final.stdenv.hostPlatform.system};
        nix-auth = inputs.nix-auth.packages.${final.stdenv.hostPlatform.system}.default;
      };

    modifications = final: prev: {
      pythonPackagesExtensions = prev.pythonPackagesExtensions or [ ] ++ [
        (_final: prev': {
          ssort = prev'.ssort.overridePythonAttrs (old: {
            postPatch = (old.postPatch or "") + ''
              python scripts/freeze_version.py ${old.version}
            '';
          });
        })
      ];
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
