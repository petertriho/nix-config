# This file defines overlays
{ inputs, ... }:
let
  removePythonLicense =
    # sh
    ''
      rm $out/lib/python*/site-packages/LICENSE
    '';
in
{
  # This one brings our custom packages from the 'pkgs' directory
  additions = final: _prev: import ../pkgs { pkgs = final; };

  # This one contains whatever you want to overlay
  # You can change versions, add patches, set compilation flags, anything really.
  # https://nixos.wiki/wiki/Overlays
  modifications = final: prev: {
    # example = prev.example.overrideAttrs (oldAttrs: rec {
    # ...
    # });
    autoflake = prev.python3Packages.autoflake.overridePythonAttrs { postFixup = removePythonLicense; };

    docformatter = prev.python3Packages.docformatter.overridePythonAttrs {
      postFixup = removePythonLicense;
    };

    howdoi = prev.python3Packages.howdoi.overridePythonAttrs (old: {
      doCheck = false;
      meta.broken = false;
    });
  };
}
