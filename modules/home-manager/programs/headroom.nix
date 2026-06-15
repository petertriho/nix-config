{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.headroom;
  optimizationCfg = cfg.optimization;
  claudeCodeCfg = cfg.integrations.claudeCode;
  cliProxyCfg = cfg.integrations.cliProxyApi;

  proxyUrl = proxyCfg: "http://${proxyCfg.host}:${toString proxyCfg.port}";
  claudeProxyUrl = proxyUrl claudeCodeCfg;
  cliProxyUrl = proxyUrl cliProxyCfg;
  mcpProxyUrl =
    if cfg.mcp.proxyUrl != null then
      cfg.mcp.proxyUrl
    else if claudeCodeCfg.enable then
      claudeProxyUrl
    else if cliProxyCfg.enable then
      cliProxyUrl
    else
      "";

  claudeUpstreamUrl =
    if claudeCodeCfg.upstreamUrl != null then
      claudeCodeCfg.upstreamUrl
    else if config.programs.claude-code.zai.enable then
      "https://api.z.ai/api/anthropic"
    else
      null;

  toEnv = lib.mapAttrs (_: value: toString value);
  toSystemdEnvironment = lib.mapAttrsToList (name: value: "${name}=${value}");

  environmentType = lib.types.attrsOf (
    lib.types.oneOf [
      lib.types.str
      lib.types.int
      lib.types.bool
    ]
  );

  optimizationEnvironment =
    (lib.optionalAttrs optimizationCfg.interceptToolResults {
      HEADROOM_INTERCEPT_ENABLED = "1";
    })
    // (lib.optionalAttrs optimizationCfg.codeAware {
      HEADROOM_CODE_AWARE_ENABLED = "1";
    })
    // (lib.optionalAttrs (optimizationCfg.compressionStableAfterTurn > 0) {
      HEADROOM_COMPRESSION_STABLE_AFTER_TURN = toString optimizationCfg.compressionStableAfterTurn;
    })
    // (lib.optionalAttrs (optimizationCfg.staleReadCompressAfterTurns > 0) {
      HEADROOM_STALE_READ_COMPRESS_AFTER_TURNS = toString optimizationCfg.staleReadCompressAfterTurns;
    });

  headroomPackage = pkgs.writeShellApplication {
    name = "headroom";
    text = ''
      export HEADROOM_TELEMETRY="''${HEADROOM_TELEMETRY:-off}"

      if [ "$#" -ge 2 ] && [ "$1" = "wrap" ] && [ "$2" = "claude" ]; then
        shift 2
        exec ${cfg.package}/bin/headroom wrap claude --no-rtk --no-serena "$@"
      fi

      exec ${cfg.package}/bin/headroom "$@"
    '';
  };

  commonProxyOptions =
    {
      defaultPort,
      descriptionName,
    }:
    {
      host = lib.mkOption {
        type = lib.types.str;
        default = "127.0.0.1";
        description = "Host address for the ${descriptionName} to bind.";
      };

      port = lib.mkOption {
        type = lib.types.port;
        default = defaultPort;
        description = "Port for the ${descriptionName} to bind.";
      };

      mode = lib.mkOption {
        type = lib.types.enum [
          "token"
          "cache"
        ];
        default = "token";
        description = "Headroom proxy optimization mode for the ${descriptionName}.";
      };

      extraArgs = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Additional arguments passed to `headroom proxy` for the ${descriptionName}.";
      };

      environment = lib.mkOption {
        type = environmentType;
        default = { };
        description = "Non-secret environment variables for the ${descriptionName}.";
      };

      environmentFile = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Absolute runtime path to a shell-compatible environment file for ${descriptionName} secrets.";
      };
    };

  baseProxyArgs = proxyCfg: [
    "${cfg.package}/bin/headroom"
    "proxy"
    "--host"
    proxyCfg.host
    "--port"
    (toString proxyCfg.port)
    "--mode"
    proxyCfg.mode
    "--disable-kompress"
  ];

  claudeProxyArgs =
    baseProxyArgs claudeCodeCfg
    ++ lib.optionals (claudeUpstreamUrl != null) [
      "--anthropic-api-url"
      claudeUpstreamUrl
    ]
    ++ claudeCodeCfg.extraArgs;

  cliProxyArgs =
    baseProxyArgs cliProxyCfg
    ++ [
      "--openai-api-url"
      cliProxyCfg.upstreamUrl
    ]
    ++ cliProxyCfg.extraArgs;

  sourceEnvironmentFile =
    proxyCfg:
    lib.optionalString (proxyCfg.environmentFile != null) ''
      set -a
      . ${lib.escapeShellArg proxyCfg.environmentFile}
      set +a
    '';

  waitForCliProxyApi = ''
    for _ in ${lib.concatStringsSep " " (map toString (lib.range 1 30))}; do
      if (: > /dev/tcp/127.0.0.1/${toString cliProxyCfg.upstreamPort}) >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  '';

  mkLaunchWrapper =
    {
      name,
      proxyCfg,
      proxyArgs,
      preStart ? "",
    }:
    pkgs.writeShellScript name ''
      set -eu
      ${sourceEnvironmentFile proxyCfg}
      ${preStart}
      exec ${lib.escapeShellArgs proxyArgs}
    '';

  claudeLaunchWrapper = mkLaunchWrapper {
    name = "headroom-claude-code-proxy-launch";
    proxyCfg = claudeCodeCfg;
    proxyArgs = claudeProxyArgs;
  };

  cliLaunchWrapper = mkLaunchWrapper {
    name = "headroom-cli-proxy-api-proxy-launch";
    proxyCfg = cliProxyCfg;
    proxyArgs = cliProxyArgs;
    preStart = waitForCliProxyApi;
  };

  claudeServiceEnvironment =
    toEnv claudeCodeCfg.environment
    // optimizationEnvironment
    // lib.optionalAttrs (claudeUpstreamUrl != null) {
      ANTHROPIC_TARGET_API_URL = claudeUpstreamUrl;
    };
  cliServiceEnvironment = toEnv cliProxyCfg.environment // optimizationEnvironment;

  mkSystemdService =
    {
      description,
      wrapper,
      environment,
      after ? [ ],
      requires ? [ ],
    }:
    {
      Unit = {
        Description = description;
        After = [ "network-online.target" ] ++ after;
      }
      // lib.optionalAttrs (requires != [ ]) {
        Requires = requires;
      };

      Install.WantedBy = [ "default.target" ];

      Service = {
        Environment = toSystemdEnvironment environment;
        ExecStart = "${wrapper}";
        Restart = "on-failure";
        RestartSec = 5;
      };
    };

  mkLaunchdAgent =
    {
      wrapper,
      environment,
    }:
    {
      enable = true;
      config = {
        ProgramArguments = [ "${wrapper}" ];
        EnvironmentVariables = environment;
        KeepAlive = {
          Crashed = true;
          SuccessfulExit = false;
        };
        ProcessType = "Background";
        RunAtLoad = true;
        ThrottleInterval = 5;
      };
    };
in
{
  options.programs.headroom = {
    enable = lib.mkEnableOption "Headroom context optimization layer";

    package = lib.mkPackageOption pkgs "headroom" { };

    mcp = {
      enable = lib.mkEnableOption "Headroom MCP server registration";

      proxyUrl = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Proxy URL used by `headroom mcp serve`; defaults to the Claude proxy, then the cli-proxy-api proxy.";
      };
    };

    integrations = {
      claudeCode =
        commonProxyOptions {
          defaultPort = 8789;
          descriptionName = "Claude Code Headroom proxy";
        }
        // {
          enable = lib.mkEnableOption "routing Claude Code through a dedicated Headroom proxy";

          upstreamUrl = lib.mkOption {
            type = lib.types.nullOr lib.types.str;
            default = null;
            description = ''
              Anthropic-compatible upstream URL for Headroom. Defaults to Z.ai
              when `programs.claude-code.zai.enable` is true, otherwise Headroom's
              upstream default.
            '';
          };
        };

      cliProxyApi =
        commonProxyOptions {
          defaultPort = 8788;
          descriptionName = "cli-proxy-api Headroom proxy";
        }
        // {
          enable = lib.mkEnableOption "routing OpenAI-compatible cli-proxy-api traffic through a dedicated Headroom proxy";

          upstreamUrl = lib.mkOption {
            type = lib.types.str;
            default = "http://127.0.0.1:8317";
            description = "OpenAI-compatible upstream URL for the existing cli-proxy-api service.";
          };

          upstreamPort = lib.mkOption {
            type = lib.types.port;
            default = 8317;
            description = "Local cli-proxy-api port used by the startup wait loop.";
          };
        };
    };

    optimization = {
      interceptToolResults = lib.mkEnableOption "tool-result interceptors via HEADROOM_INTERCEPT_ENABLED";

      codeAware = lib.mkEnableOption "AST-based code-aware compression via HEADROOM_CODE_AWARE_ENABLED";

      compressionStableAfterTurn = lib.mkOption {
        type = lib.types.ints.unsigned;
        default = 0;
        description = "Value for HEADROOM_COMPRESSION_STABLE_AFTER_TURN. 0 leaves the default.";
      };

      staleReadCompressAfterTurns = lib.mkOption {
        type = lib.types.ints.unsigned;
        default = 0;
        description = "Value for HEADROOM_STALE_READ_COMPRESS_AFTER_TURNS. 0 leaves the default.";
      };
    };
  };

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        assertions = [
          {
            assertion = !claudeCodeCfg.enable || config.programs.claude-code.enable;
            message = "programs.headroom.integrations.claudeCode.enable requires programs.claude-code.enable.";
          }
          {
            assertion =
              !cfg.mcp.enable || cfg.mcp.proxyUrl != null || claudeCodeCfg.enable || cliProxyCfg.enable;
            message = "programs.headroom.mcp.enable requires mcp.proxyUrl or at least one Headroom proxy integration.";
          }
          {
            assertion =
              claudeCodeCfg.environmentFile == null || lib.hasPrefix "/" claudeCodeCfg.environmentFile;
            message = "programs.headroom.integrations.claudeCode.environmentFile must be an absolute runtime path.";
          }
          {
            assertion = cliProxyCfg.environmentFile == null || lib.hasPrefix "/" cliProxyCfg.environmentFile;
            message = "programs.headroom.integrations.cliProxyApi.environmentFile must be an absolute runtime path.";
          }
        ];

        home = {
          packages = [ headroomPackage ];
          sessionVariables = {
            HEADROOM_TELEMETRY = "off";
          }
          // optimizationEnvironment
          // lib.optionalAttrs claudeCodeCfg.enable {
            ANTHROPIC_BASE_URL = lib.mkForce claudeProxyUrl;
          };
        };
      }

      (lib.mkIf cfg.mcp.enable {
        programs.mcp.servers.headroom = {
          command = "headroom";
          args = [
            "mcp"
            "serve"
            "--proxy-url"
            mcpProxyUrl
          ];
          env = {
            HEADROOM_PROXY_URL = mcpProxyUrl;
          };
          disabled = false;
        };
      })

      (lib.mkIf (claudeCodeCfg.enable && pkgs.stdenv.isLinux) {
        systemd.user.services.headroom-claude-code-proxy = mkSystemdService {
          description = "Headroom Claude Code optimization proxy";
          wrapper = claudeLaunchWrapper;
          environment = claudeServiceEnvironment;
        };
      })

      (lib.mkIf (cliProxyCfg.enable && pkgs.stdenv.isLinux) {
        systemd.user.services.headroom-cli-proxy-api-proxy = mkSystemdService {
          description = "Headroom cli-proxy-api optimization proxy";
          wrapper = cliLaunchWrapper;
          environment = cliServiceEnvironment;
          after = [ "cli-proxy-api.service" ];
          requires = [ "cli-proxy-api.service" ];
        };
      })

      (lib.mkIf (claudeCodeCfg.enable && pkgs.stdenv.isDarwin) {
        launchd.agents.headroom-claude-code-proxy = mkLaunchdAgent {
          wrapper = claudeLaunchWrapper;
          environment = claudeServiceEnvironment;
        };
      })

      (lib.mkIf (cliProxyCfg.enable && pkgs.stdenv.isDarwin) {
        launchd.agents.headroom-cli-proxy-api-proxy = mkLaunchdAgent {
          wrapper = cliLaunchWrapper;
          environment = cliServiceEnvironment;
        };
      })

      (lib.mkIf (cliProxyCfg.enable && config.programs.opencode.enable) {
        programs.opencode.settings.provider.openai.options.baseURL = lib.mkForce "${cliProxyUrl}/v1";
      })
    ]
  );
}
