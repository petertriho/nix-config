{
  config,
  lib,
  pkgs,
  ...
}:
let
  cliProxyApiKeyEnvVar = "CLI_PROXY_API_KEY";
  cliProxyApiKeyDefault = "sk-dummy";
  cliProxyConfig = "${config.home.homeDirectory}/.cli-proxy-api/config.yaml";

  cliProxyEnvironment = {
    ${cliProxyApiKeyEnvVar} = cliProxyApiKeyDefault;
  };

  cpaDataDir = "${config.xdg.dataHome}/cpa-manager";

  cpaManagerEnvironment = {
    HTTP_ADDR = "127.0.0.1:18317";
    USAGE_DATA_DIR = cpaDataDir;
    USAGE_DB_PATH = "${cpaDataDir}/usage.sqlite";
    CPA_UPSTREAM_URL = "http://127.0.0.1:8317";
    ${cliProxyApiKeyEnvVar} = cliProxyApiKeyDefault;
    USAGE_COLLECTOR_MODE = "auto";
  };

  toSystemdEnvironment = lib.mapAttrsToList (name: value: "${name}=${value}");

  cliProxyApiLaunchWrapper = pkgs.writeShellScript "cli-proxy-api-launch" ''
    set -eu
    export MANAGEMENT_PASSWORD="''${${cliProxyApiKeyEnvVar}:-${cliProxyApiKeyDefault}}"
    exec ${pkgs.llm-agents.cli-proxy-api}/bin/cli-proxy-api --config ${lib.escapeShellArg cliProxyConfig}
  '';

  cpaManagerLaunchWrapper = pkgs.writeShellScript "cpa-manager-launch" ''
    set -eu
    ${pkgs.coreutils}/bin/mkdir -p ${lib.escapeShellArg cpaDataDir}
    export CPA_MANAGEMENT_KEY="''${${cliProxyApiKeyEnvVar}:-${cliProxyApiKeyDefault}}"
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

      file.".config/opencode/plugins/cli-proxy-api-models.js".source =
        config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/plugins/cli-proxy-api-models.js";

      sessionVariables.CLI_PROXY_API_KEY = cliProxyApiKeyDefault;
    };

    programs.opencode.settings = {
      provider.openai.options = {
        baseURL = lib.mkDefault "http://127.0.0.1:8317/v1";
        apiKey = "{env:${cliProxyApiKeyEnvVar}}";
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
        ExecStart = "${cliProxyApiLaunchWrapper}";
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
        ExecStart = "${cpaManagerLaunchWrapper}";
        Restart = "on-failure";
        RestartSec = 5;
      };
    };
  })

  (lib.mkIf pkgs.stdenv.isDarwin {
    launchd.agents.cli-proxy-api = {
      enable = true;
      config = {
        ProgramArguments = [ "${cliProxyApiLaunchWrapper}" ];
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
        ProgramArguments = [ "${cpaManagerLaunchWrapper}" ];
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
