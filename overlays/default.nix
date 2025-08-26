{ inputs, ... }:
{
  additions =
    final: prev:
    import ../pkgs { pkgs = final; }
    // {
      fishPlugins = (prev.fishPlugins or { }) // import ../pkgs/fish-plugins { pkgs = final; };
      tmuxPlugins = (prev.tmuxPlugins or { }) // import ../pkgs/tmux-plugins { pkgs = final; };
    };

  modifications =
    final: prev:
    let
      removePythonLicense =
        # sh
        ''
          rm $out/lib/python*/site-packages/LICENSE
        '';
    in
    {
      autoflake = prev.python3Packages.autoflake.overridePythonAttrs { postFixup = removePythonLicense; };
      commitmsgfmt = prev.commitmsgfmt.overrideAttrs (oldAttrs: {
        doCheck = false;
      });
      pylint = prev.python3Packages.pylint.overridePythonAttrs {
        dependencies = prev.python3Packages.pylint.dependencies ++ [ prev.python3Packages.pylint-venv ];
      };
    };

  stable = final: prev: {
    stable = import inputs.nixpkgs-stable {
      inherit (final) system;
      config.allowUnfree = true;
    };
  };

  unstable = final: prev: {
    unstable = import inputs.nixpkgs-unstable {
      inherit (final) system;
      config.allowUnfree = true;
    };
  };
}
