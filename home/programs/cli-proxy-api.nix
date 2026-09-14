{
  config,
  lib,
  pkgs,
  ...
}:
let
  cliProxyApiKeyEnvVar = "CLI_PROXY_API_KEY";
  cliProxyApiKeyDefault = "sk-dummy";
  cliProxyApiBaseUrl = "http://127.0.0.1:8317";
  cliProxyConfig = "${config.home.homeDirectory}/.cli-proxy-api/config.yaml";

  cliProxyEnvironment = {
    ${cliProxyApiKeyEnvVar} = cliProxyApiKeyDefault;
  };

  cpaUsageKeeperDataDir = "${config.xdg.dataHome}/cpa-usage-keeper";

  cpaUsageKeeperEnvironment = {
    APP_HOST = "127.0.0.1";
    APP_PORT = "18317";
    WORK_DIR = cpaUsageKeeperDataDir;
    CPA_BASE_URL = cliProxyApiBaseUrl;
    AUTH_ENABLED = "true";
    ${cliProxyApiKeyEnvVar} = cliProxyApiKeyDefault;
  };

  toSystemdEnvironment = lib.mapAttrsToList (name: value: "${name}=${value}");

  cliProxyApiLaunchWrapper = pkgs.writeShellScript "cli-proxy-api-launch" ''
    set -eu
    export MANAGEMENT_PASSWORD="''${${cliProxyApiKeyEnvVar}:-${cliProxyApiKeyDefault}}"
    exec ${pkgs.llm-agents.cli-proxy-api}/bin/cli-proxy-api --config ${lib.escapeShellArg cliProxyConfig}
  '';

  cpaUsageKeeperLaunchWrapper = pkgs.writeShellScript "cpa-usage-keeper-launch" ''
    set -eu
    ${pkgs.coreutils}/bin/mkdir -p ${lib.escapeShellArg cpaUsageKeeperDataDir}
    cpaUsageKeeperKey="''${${cliProxyApiKeyEnvVar}:-${cliProxyApiKeyDefault}}"
    export CPA_MANAGEMENT_KEY="$cpaUsageKeeperKey"
    export LOGIN_PASSWORD="$cpaUsageKeeperKey"
    exec ${pkgs.llm-agents.cpa-usage-keeper}/bin/cpa-usage-keeper
  '';
in
lib.mkMerge [
  {
    home = {
      packages = [
        pkgs.llm-agents.cpa-usage-keeper
        pkgs.llm-agents.cli-proxy-api
      ];

      file.".cli-proxy-api/config.yaml".source =
        config.lib.meta.mkDotfilesSymlink "cli-proxy-api/.cli-proxy-api/config.yaml";

      file.".config/opencode/plugins/cli-proxy-api-models.js".source =
        config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/plugins/cli-proxy-api-models.js";

      sessionVariables = {
        CLI_PROXY_API_KEY = cliProxyApiKeyDefault;

        # Consumed by the personal pi-cliproxyapi-provider.ts extension (linked
        # below): the proxy root for the model catalog and inference, and the
        # bearer token pi resolves at request time.
        CLIPROXYAPI_BASE_URL = cliProxyApiBaseUrl;
        CLIPROXYAPI_API_KEY = cliProxyApiKeyDefault;
      };
    };

    programs.opencode.settings = {
      provider.openai.options = {
        baseURL = lib.mkDefault "${cliProxyApiBaseUrl}/v1";
        apiKey = "{env:${cliProxyApiKeyEnvVar}}";
      };
    };
  }

  (lib.mkIf config.programs.pi-coding-agent.enable {
    home.file."${config.programs.pi-coding-agent.configDir}/extensions/pi-cliproxyapi-provider.ts".source =
      config.lib.meta.mkDotfilesSymlink "pi/.pi/agent/extensions/pi-cliproxyapi-provider.ts";
  })

  (lib.mkIf pkgs.stdenv.hostPlatform.isLinux {
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

    systemd.user.services.cpa-usage-keeper = {
      Unit = {
        Description = "CPA Usage Keeper usage service";
        After = [
          "network-online.target"
          "cli-proxy-api.service"
        ];
        Wants = [ "cli-proxy-api.service" ];
      };

      Install.WantedBy = [ "default.target" ];

      Service = {
        Environment = toSystemdEnvironment cpaUsageKeeperEnvironment;
        ExecStartPre = "${pkgs.coreutils}/bin/mkdir -p ${cpaUsageKeeperDataDir}";
        ExecStart = "${cpaUsageKeeperLaunchWrapper}";
        Restart = "on-failure";
        RestartSec = 5;
      };
    };
  })

  (lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
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

    launchd.agents.cpa-usage-keeper = {
      enable = true;
      config = {
        ProgramArguments = [ "${cpaUsageKeeperLaunchWrapper}" ];
        EnvironmentVariables = cpaUsageKeeperEnvironment;
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
