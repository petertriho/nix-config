{ inputs, ... }:
{
  additions =
    final: prev:
    import ../pkgs {
      pkgs = final;
      inherit inputs;
    }
    // {
      fishPlugins = (prev.fishPlugins or { }) // import ../pkgs/fish-plugins { pkgs = final; };
      tmuxPlugins = (prev.tmuxPlugins or { }) // import ../pkgs/tmux-plugins { pkgs = final; };
      mcp-servers = inputs.mcp-servers-nix.packages.${final.stdenv.hostPlatform.system};
      llm-agents = inputs.llm-agents.packages.${final.stdenv.hostPlatform.system};
      nix-auth = inputs.nix-auth.packages.${final.stdenv.hostPlatform.system}.default;
    };

  modifications = final: prev: {
    commitmsgfmt = prev.commitmsgfmt.overrideAttrs (oldAttrs: {
      doCheck = false;
    });
    pylint = prev.python3Packages.pylint.overridePythonAttrs {
      dependencies = prev.python3Packages.pylint.dependencies ++ [ prev.python3Packages.pylint-venv ];
    };
    crystal = prev.crystal_1_18; # TODO: remove when fixed in nixpkgs https://github.com/NixOS/nixpkgs/issues/487193
  };

  stable = final: prev: {
    stable = import inputs.nixpkgs-stable {
      system = final.stdenv.hostPlatform.system;
      config = {
        allowUnfree = true;
        allowBroken = true;
      };
    };
  };

  unstable = final: prev: {
    unstable = import inputs.nixpkgs-unstable {
      system = final.stdenv.hostPlatform.system;
      config = {
        allowUnfree = true;
        allowBroken = true;
      };
    };
  };
}
