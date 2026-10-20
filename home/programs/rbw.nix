{
  config,
  lib,
  pkgs,
  ...
}:
let
  configDir =
    if pkgs.stdenv.hostPlatform.isDarwin then
      "${config.home.homeDirectory}/Library/Application Support"
    else
      config.xdg.configHome;
  # Launchers do not provide the terminal that pinentry-curses needs.
  pinentryPackage = if pkgs.stdenv.hostPlatform.isDarwin then pkgs.pinentry_mac else pkgs.pinentry-qt;
  jsonFormat = pkgs.formats.json { };
  settings = {
    lock_timeout = 14400;
    pinentry = lib.getExe pinentryPackage;
  };
in
{
  programs.rbw.enable = true;
  home.packages = [ pinentryPackage ];

  # Keep account and server settings writable and out of the Nix store.
  home.activation.rbwMutableConfig = lib.hm.dag.entryAfter [ "linkGeneration" ] (
    lib.hm.generators.mkImpureConfigMerger {
      inherit pkgs;
      path = "${configDir}/rbw/config.json";
      staticSettings = jsonFormat.generate "rbw-config.json" settings;
      format = "json";
      empty = "{}";
      mode = "600";
      jqOperation = ''
        if ($dynamic | type) == "object" and ($static | type) == "object" then
          $dynamic * $static
        else
          error("expected JSON objects")
        end
      '';
    }
  );
}
