{ inputs, ... }:
{
  additions =
    final: prev:
    import ../pkgs { pkgs = final; }
    // {
      fishPlugins = (prev.fishPlugins or { }) // import ../pkgs/fish-plugins { pkgs = final; };
      tmuxPlugins = (prev.tmuxPlugins or { }) // import ../pkgs/tmux-plugins { pkgs = final; };
    };

  modifications = final: prev: {
    commitmsgfmt = prev.commitmsgfmt.overrideAttrs (oldAttrs: {
      doCheck = false;
    });
    pylint = prev.python3Packages.pylint.overridePythonAttrs {
      dependencies = prev.python3Packages.pylint.dependencies ++ [ prev.python3Packages.pylint-venv ];
    };
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
