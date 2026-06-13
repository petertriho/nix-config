{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.headroom;
  proxyCfg = cfg.proxy;
  optimizationCfg = cfg.optimization;
  cliProxyCfg = cfg.integrations.cliProxyApi;

  toEnv = lib.mapAttrs (_: value: toString value);
  proxyEnvironment = toEnv proxyCfg.environment;
  toSystemdEnvironment = lib.mapAttrsToList (name: value: "${name}=${value}");

  # Optimization env vars. Applied both to the managed proxy service (so the
  # long-running `headroom proxy` honours them) and to `home.sessionVariables`
  # (so `headroom wrap <tool>` inherits them — the wrap subprocess copies the
  # parent environment into its transient proxy).
  optimizationEnvironment =
    (lib.optionalAttrs optimizationCfg.interceptToolResults {
      HEADROOM_INTERCEPT_ENABLED = "1";
    })
    // (lib.optionalAttrs (optimizationCfg.compressionStableAfterTurn > 0) {
      HEADROOM_COMPRESSION_STABLE_AFTER_TURN = toString optimizationCfg.compressionStableAfterTurn;
    })
    // (lib.optionalAttrs (optimizationCfg.staleReadCompressAfterTurns > 0) {
      HEADROOM_STALE_READ_COMPRESS_AFTER_TURNS = toString optimizationCfg.staleReadCompressAfterTurns;
    })
    // (lib.optionalAttrs optimizationCfg.codeAware {
      HEADROOM_CODE_AWARE_ENABLED = "1";
    });

  proxyUrl = "http://${proxyCfg.host}:${toString proxyCfg.port}";
  mcpProxyUrl = if cfg.mcp.proxyUrl == null then proxyUrl else cfg.mcp.proxyUrl;

  headroomPackage = pkgs.writeShellApplication {
    name = "headroom";
    text = ''
      export HEADROOM_TELEMETRY="''${HEADROOM_TELEMETRY:-off}"

      # RTK is installed and hooked by this profile; avoid Headroom's per-launch setup timeout.
      if [ "$#" -ge 2 ] && [ "$1" = "wrap" ] && [ "$2" = "claude" ]; then
        shift 2
        exec ${cfg.package}/bin/headroom wrap claude --no-rtk --no-serena "$@"
      fi

      exec ${cfg.package}/bin/headroom "$@"
    '';
  };

  proxyArgs = [
    "${headroomPackage}/bin/headroom"
    "proxy"
    "--host"
    proxyCfg.host
    "--port"
    (toString proxyCfg.port)
    "--mode"
    proxyCfg.mode
  ]
  ++ lib.optionals cliProxyCfg.enable [
    "--openai-api-url"
    cliProxyCfg.upstreamUrl
  ]
  ++ proxyCfg.extraArgs;

  sourceEnvironmentFile = lib.optionalString (proxyCfg.environmentFile != null) ''
    set -a
    . ${lib.escapeShellArg proxyCfg.environmentFile}
    set +a
  '';

  waitForCliProxyApi = lib.optionalString cliProxyCfg.enable ''
    for _ in ${lib.concatStringsSep " " (map toString (lib.range 1 30))}; do
      if (: > /dev/tcp/127.0.0.1/${toString cliProxyCfg.upstreamPort}) >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  '';

  proxyLaunchWrapper = pkgs.writeShellScript "headroom-proxy-launch" ''
    set -eu
    ${sourceEnvironmentFile}
    ${waitForCliProxyApi}
    exec ${lib.escapeShellArgs proxyArgs}
  '';
in
{
  options.programs.headroom = {
    enable = lib.mkEnableOption "Headroom context optimization layer";

    package = lib.mkPackageOption pkgs "headroom" { };

    proxy = {
      enable = lib.mkEnableOption "Headroom proxy service";

      host = lib.mkOption {
        type = lib.types.str;
        default = "127.0.0.1";
        description = "Host address for the Headroom proxy to bind.";
      };

      port = lib.mkOption {
        type = lib.types.port;
        default = 8787;
        description = "Port for the Headroom proxy to bind.";
      };

      mode = lib.mkOption {
        type = lib.types.enum [
          "token"
          "cache"
        ];
        default = "token";
        description = "Headroom optimization mode passed to `headroom proxy --mode`.";
      };

      extraArgs = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Additional arguments passed to `headroom proxy`.";
      };

      environment = lib.mkOption {
        type = lib.types.attrsOf (
          lib.types.oneOf [
            lib.types.str
            lib.types.int
            lib.types.bool
          ]
        );
        default = { };
        description = "Non-secret environment variables for the Headroom proxy service.";
      };

      environmentFile = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Absolute runtime path to a shell-compatible environment file for secrets.";
      };
    };

    mcp = {
      enable = lib.mkEnableOption "Headroom MCP server registration";

      proxyUrl = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Proxy URL used by `headroom mcp serve`; defaults to the managed proxy URL.";
      };
    };

    integrations.cliProxyApi = {
      enable = lib.mkEnableOption "routing opencode through Headroom and the local cli-proxy-api";

      upstreamUrl = lib.mkOption {
        type = lib.types.str;
        default = "http://127.0.0.1:8317";
        description = "OpenAI-compatible upstream URL for the existing cli-proxy-api service.";
      };

      upstreamPort = lib.mkOption {
        type = lib.types.port;
        default = 8317;
        description = "Local cli-proxy-api port used by the launchd startup wait loop.";
      };
    };

    optimization = {
      interceptToolResults = lib.mkEnableOption ''
        tool-result interceptors (ast-grep Read outliner, etc.) via
        HEADROOM_INTERCEPT_ENABLED. Off by default upstream while the feature
        ships; enables compression of tool results that sit outside the cached
        prefix.
      '';

      codeAware = lib.mkEnableOption ''
        AST-based code-aware compression (tree-sitter) via
        HEADROOM_CODE_AWARE_ENABLED. Requires the `headroom-ai[code]` extra
        (tree-sitter-language-pack) in the package; without it the proxy logs a
        warning and code-aware stays unavailable.
      '';

      compressionStableAfterTurn = lib.mkOption {
        type = lib.types.ints.unsigned;
        default = 0;
        description = ''
          Value for HEADROOM_COMPRESSION_STABLE_AFTER_TURN. Headroom stays
          conservative (no compression) for the first this-many turns of a
          session before compressing more aggressively. 0 leaves the default.
        '';
      };

      staleReadCompressAfterTurns = lib.mkOption {
        type = lib.types.ints.unsigned;
        default = 0;
        description = ''
          Value for HEADROOM_STALE_READ_COMPRESS_AFTER_TURNS. Read tool results
          older than this-many turns become eligible for compression. 0 leaves
          the default.
        '';
      };
    };
  };

  config = lib.mkMerge [
    (lib.mkIf
      (cfg.enable && config.programs.claude-code.enable && config.programs.claude-code.zai.enable)
      {
        home.sessionVariables = {
          ANTHROPIC_TARGET_API_URL = "https://api.z.ai/api/anthropic";
        };
      }
    )

    (lib.mkIf cfg.enable (
      lib.mkMerge [
        {
          assertions = [
            {
              assertion = !cliProxyCfg.enable || proxyCfg.enable;
              message = "programs.headroom.integrations.cliProxyApi.enable requires programs.headroom.proxy.enable.";
            }
            {
              assertion = proxyCfg.environmentFile == null || lib.hasPrefix "/" proxyCfg.environmentFile;
              message = "programs.headroom.proxy.environmentFile must be an absolute runtime path.";
            }
          ];

          home = {
            packages = [ headroomPackage ];
            sessionVariables = {
              HEADROOM_TELEMETRY = lib.mkDefault "off";
            } // optimizationEnvironment;
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

        (lib.mkIf (proxyCfg.enable && pkgs.stdenv.isLinux) {
          systemd.user.services.headroom-proxy = {
            Unit = {
              Description = "Headroom optimization proxy";
              After = [ "network-online.target" ] ++ lib.optional cliProxyCfg.enable "cli-proxy-api.service";
              Requires = lib.optional cliProxyCfg.enable "cli-proxy-api.service";
            };

            Install.WantedBy = [ "default.target" ];

            Service = {
              Environment = toSystemdEnvironment (proxyEnvironment // optimizationEnvironment);
              ExecStart = "${proxyLaunchWrapper}";
              Restart = "on-failure";
              RestartSec = 5;
            };
          };
        })

        (lib.mkIf (proxyCfg.enable && pkgs.stdenv.isDarwin) {
          launchd.agents.headroom-proxy = {
            enable = true;
            config = {
              ProgramArguments = [ "${proxyLaunchWrapper}" ];
              EnvironmentVariables = proxyEnvironment // optimizationEnvironment;
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

        (lib.mkIf (cliProxyCfg.enable && config.programs.opencode.enable) {
          programs.opencode.settings.provider.openai.options.baseURL = "${proxyUrl}/v1";
        })
      ]
    ))
  ];
}
