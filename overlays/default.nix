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

      docformatter = prev.python3Packages.docformatter.overridePythonAttrs {
        postFixup = removePythonLicense;
      };

      howdoi = prev.python3Packages.howdoi.overridePythonAttrs (old: {
        doCheck = false;
        meta.broken = false;
      });
    };

  stable = final: prev: {
    stable = import inputs.nixpkgs-stable {
      inherit (final) system;
      config.allowUnfree = true;
    };
  };
}
