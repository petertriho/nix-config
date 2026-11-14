{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.portless;
  skillsDir = "${cfg.package}/share/portless/skills";
  setDefaultFlags = lib.concatStringsSep " " (
    lib.mapAttrsToList (
      name: value: "--set-default ${lib.escapeShellArg name} ${lib.escapeShellArg value}"
    ) cfg.environment
  );
in
{
  options.programs.portless = {
    enable = lib.mkEnableOption "portless named local dev URLs";

    package = lib.mkPackageOption pkgs "portless" { };

    environment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      # NixOS cannot trust the portless CA, and `/etc/hosts` is read-only.
      # A plain HTTP proxy on an unprivileged port needs no sudo, so an agent
      # without a TTY can auto-start it. `myhostname` resolves *.localhost.
      default = lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
        PORTLESS_PORT = "1355";
        PORTLESS_HTTPS = "0";
        PORTLESS_SYNC_HOSTS = "0";
      };
      example = {
        PORTLESS_PORT = "1355";
        PORTLESS_HTTPS = "0";
      };
      description = ''
        Defaults that the `portless` wrapper sets with `--set-default`.
        A value in the caller's environment still wins.
      '';
    };

    finalPackage = lib.mkOption {
      type = lib.types.package;
      readOnly = true;
      internal = true;
      description = "The `portless` package with the `environment` defaults applied.";
    };
  };

  config = lib.mkIf cfg.enable {
    programs.portless.finalPackage =
      if cfg.environment == { } then
        cfg.package
      else
        pkgs.symlinkJoin {
          name = "${cfg.package.name}-wrapped";
          paths = [ cfg.package ];
          nativeBuildInputs = [ pkgs.makeWrapper ];
          postBuild = ''
            wrapProgram "$out/bin/portless" ${setDefaultFlags}
          '';
          inherit (cfg.package) meta;
        };

    home.packages = [ cfg.finalPackage ];

    # The default `core` tool profile: routes, URL lookup, static aliases.
    programs.ai.mcp.portless = {
      command = lib.getExe' cfg.finalPackage "portless";
      args = [ "mcp" ];
    };

    programs.ai.skills = {
      portless.source = "${skillsDir}/portless";
      oauth.source = "${skillsDir}/oauth";
    };

    # `portless run` registers routes in ~/.portless, so sandboxed agents
    # need it writable.
    programs.nono.agentFilesystem = lib.genAttrs [ "claude" "pi" "opencode" ] (_: {
      allow = [ "$HOME/.portless" ];
    });
  };
}
