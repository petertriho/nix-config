{
  config,
  pkgs,
  ...
}:
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
    model = "gpt-5.5";
    provider.openai.options = {
      baseURL = "http://127.0.0.1:8317/v1";
      apiKey = "sk-dummy";
    };
  };

  systemd.user.services.cli-proxy-api = {
    Unit = {
      Description = "CLIProxyAPI local proxy";
      After = [ "network-online.target" ];
    };

    Install.WantedBy = [ "default.target" ];

    Service = {
      Environment = [ "MANAGEMENT_PASSWORD=sk-dummy" ];
      ExecStart = "${pkgs.llm-agents.cli-proxy-api}/bin/cli-proxy-api --config ${config.home.homeDirectory}/.cli-proxy-api/config.yaml";
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
      Environment = [
        "HTTP_ADDR=127.0.0.1:18317"
        "USAGE_DATA_DIR=${config.xdg.dataHome}/cpa-manager"
        "USAGE_DB_PATH=${config.xdg.dataHome}/cpa-manager/usage.sqlite"
        "CPA_UPSTREAM_URL=http://127.0.0.1:8317"
        "CPA_MANAGEMENT_KEY=sk-dummy"
        "USAGE_COLLECTOR_MODE=auto"
      ];
      ExecStartPre = "${pkgs.coreutils}/bin/mkdir -p ${config.xdg.dataHome}/cpa-manager";
      ExecStart = "${pkgs.cpa-manager}/bin/cpa-manager";
      Restart = "on-failure";
      RestartSec = 5;
    };
  };
}
