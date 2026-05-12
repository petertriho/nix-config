{
  config,
  lib,
  pkgs,
  ...
}:
let
  cliProxyConfig = "${config.home.homeDirectory}/.cli-proxy-api/config.yaml";

  cliProxyEnvironment = {
    MANAGEMENT_PASSWORD = "sk-dummy";
  };

  cpaDataDir = "${config.xdg.dataHome}/cpa-manager";

  cpaManagerEnvironment = {
    HTTP_ADDR = "127.0.0.1:18317";
    USAGE_DATA_DIR = cpaDataDir;
    USAGE_DB_PATH = "${cpaDataDir}/usage.sqlite";
    CPA_UPSTREAM_URL = "http://127.0.0.1:8317";
    CPA_MANAGEMENT_KEY = "sk-dummy";
    USAGE_COLLECTOR_MODE = "auto";
  };

  toSystemdEnvironment = lib.mapAttrsToList (name: value: "${name}=${value}");

  cpaManagerLaunchdWrapper = pkgs.writeShellScript "cpa-manager-launchd" ''
    ${pkgs.coreutils}/bin/mkdir -p ${lib.escapeShellArg cpaDataDir}
    exec ${pkgs.cpa-manager}/bin/cpa-manager
  '';
in
lib.mkMerge [
  {
    home = {
      packages = [
        pkgs.cpa-manager
        pkgs.llm-agents.cli-proxy-api
      ];

      file.".cli-proxy-api/config.yaml".source =
        config.lib.meta.mkDotfilesSymlink "cli-proxy-api/.cli-proxy-api/config.yaml";
    };

    programs.opencode.settings = {
      provider.openai.options = {
        baseURL = "http://127.0.0.1:8317/v1";
        apiKey = "sk-dummy";
      };
    };
  }

  (lib.mkIf pkgs.stdenv.isLinux {
    systemd.user.services.cli-proxy-api = {
      Unit = {
        Description = "CLIProxyAPI local proxy";
        After = [ "network-online.target" ];
      };

      Install.WantedBy = [ "default.target" ];

      Service = {
        Environment = toSystemdEnvironment cliProxyEnvironment;
        ExecStart = "${pkgs.llm-agents.cli-proxy-api}/bin/cli-proxy-api --config ${cliProxyConfig}";
        Restart = "on-failure";
        RestartSec = 5;
      };
    };

    systemd.user.services.cpa-manager = {
      Unit = {
        Description = "CPA-Manager usage service";
        After = [
          "network-online.target"
          "cli-proxy-api.service"
        ];
        Requires = [ "cli-proxy-api.service" ];
      };

      Install.WantedBy = [ "default.target" ];

      Service = {
        Environment = toSystemdEnvironment cpaManagerEnvironment;
        ExecStartPre = "${pkgs.coreutils}/bin/mkdir -p ${cpaDataDir}";
        ExecStart = "${pkgs.cpa-manager}/bin/cpa-manager";
        Restart = "on-failure";
        RestartSec = 5;
      };
    };
  })

  (lib.mkIf pkgs.stdenv.isDarwin {
    launchd.agents.cli-proxy-api = {
      enable = true;
      config = {
        ProgramArguments = [
          "${pkgs.llm-agents.cli-proxy-api}/bin/cli-proxy-api"
          "--config"
          cliProxyConfig
        ];
        EnvironmentVariables = cliProxyEnvironment;
        KeepAlive = {
          Crashed = true;
          SuccessfulExit = false;
        };
        ProcessType = "Background";
        RunAtLoad = true;
        ThrottleInterval = 5;
      };
    };

    launchd.agents.cpa-manager = {
      enable = true;
      config = {
        ProgramArguments = [ "${cpaManagerLaunchdWrapper}" ];
        EnvironmentVariables = cpaManagerEnvironment;
        KeepAlive = {
          Crashed = true;
          SuccessfulExit = false;
        };
        ProcessType = "Background";
        RunAtLoad = true;
        ThrottleInterval = 5;
      };
    };
  })
]
