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

  cpaManagerPlusDataDir = "${config.xdg.dataHome}/cpa-manager-plus";

  cpaManagerPlusEnvironment = {
    HTTP_ADDR = "127.0.0.1:18317";
    USAGE_DATA_DIR = cpaManagerPlusDataDir;
    USAGE_DB_PATH = "${cpaManagerPlusDataDir}/usage.sqlite";
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

  cpaManagerPlusLaunchWrapper = pkgs.writeShellScript "cpa-manager-plus-launch" ''
    set -eu
    ${pkgs.coreutils}/bin/mkdir -p ${lib.escapeShellArg cpaManagerPlusDataDir}
    cpaManagerPlusKey="''${${cliProxyApiKeyEnvVar}:-${cliProxyApiKeyDefault}}"
    export CPA_MANAGER_ADMIN_KEY="$cpaManagerPlusKey"
    export CPA_MANAGEMENT_KEY="$cpaManagerPlusKey"
    exec ${pkgs.cpa-manager-plus}/bin/cpa-manager-plus
  '';
in
lib.mkMerge [
  {
    home = {
      packages = [
        pkgs.cpa-manager-plus
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

    systemd.user.services.cpa-manager-plus = {
      Unit = {
        Description = "CPA Manager Plus usage service";
        After = [
          "network-online.target"
          "cli-proxy-api.service"
        ];
        Wants = [ "cli-proxy-api.service" ];
      };

      Install.WantedBy = [ "default.target" ];

      Service = {
        Environment = toSystemdEnvironment cpaManagerPlusEnvironment;
        ExecStartPre = "${pkgs.coreutils}/bin/mkdir -p ${cpaManagerPlusDataDir}";
        ExecStart = "${cpaManagerPlusLaunchWrapper}";
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

    launchd.agents.cpa-manager-plus = {
      enable = true;
      config = {
        ProgramArguments = [ "${cpaManagerPlusLaunchWrapper}" ];
        EnvironmentVariables = cpaManagerPlusEnvironment;
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
