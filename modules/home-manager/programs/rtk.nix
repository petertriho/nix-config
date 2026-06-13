{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.rtk;

  rtkPlugin = ''
    import type { Plugin } from "@opencode-ai/plugin"

    const rtk = "${cfg.package}/bin/rtk"

    // RTK OpenCode plugin - rewrites supported shell commands through RTK.
    // All rewrite decisions live in `rtk rewrite`.
    export const RtkOpenCodePlugin: Plugin = async ({ $ }) => {
      try {
        await $`''${rtk} --version`.quiet()
      } catch {
        console.warn("[rtk] rtk binary not usable - plugin disabled")
        return {}
      }

      return {
        "tool.execute.before": async (input, output) => {
          const tool = String(input?.tool ?? "").toLowerCase()
          if (tool !== "bash" && tool !== "shell") return

          const args = output?.args
          if (!args || typeof args !== "object") return

          const command = (args as Record<string, unknown>).command
          if (typeof command !== "string" || !command) return

          try {
            const result = await $`''${rtk} rewrite ''${command}`.quiet().nothrow()
            const rewritten = String(result.stdout).trim()
            if (rewritten && rewritten !== command) {
              ;(args as Record<string, unknown>).command = rewritten
            }
          } catch {
            // RTK rewrite failed; leave the command unchanged.
          }
        },
      }
    }

    export default RtkOpenCodePlugin
  '';

  rtkInstructions = ''
    # RTK - Rust Token Killer

    **Usage**: Token-optimized CLI proxy (60-90% savings on dev operations)

    ## Meta Commands (always use rtk directly)

    ```bash
    rtk gain              # Show token savings analytics
    rtk gain --history    # Show command usage history with savings
    rtk discover          # Analyze Claude Code history for missed opportunities
    rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
    ```

    ## Installation Verification

    ```bash
    rtk --version         # Should show: rtk X.Y.Z
    rtk gain              # Should work (not "command not found")
    which rtk             # Verify correct binary
    ```

    Warning: If `rtk gain` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

    ## Hook-Based Usage

    All other commands are automatically rewritten by the Claude Code hook.
    Example: `git status` -> `rtk git status` (transparent, 0 tokens overhead)

    Refer to CLAUDE.md for full command reference.
  '';
in
{
  options.programs.rtk = {
    enable = lib.mkEnableOption "RTK integration for AI coding agents";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.llm-agents.rtk;
      defaultText = lib.literalExpression "pkgs.llm-agents.rtk";
      description = "RTK package to install and use from generated integrations.";
    };

    integrations = {
      opencode.enable = lib.mkOption {
        type = lib.types.bool;
        default = config.programs.opencode.enable;
        defaultText = lib.literalExpression "config.programs.opencode.enable";
        description = "Whether to install the native RTK OpenCode plugin.";
      };

      claude-code.enable = lib.mkOption {
        type = lib.types.bool;
        default = config.programs.claude-code.enable;
        defaultText = lib.literalExpression "config.programs.claude-code.enable";
        description = "Whether to install deterministic Claude Code RTK init files.";
      };
    };
  };

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        home.packages = [ cfg.package ];
      }

      (lib.mkIf cfg.integrations.opencode.enable {
        xdg.configFile."opencode/plugins/rtk.ts".text = rtkPlugin;
      })

      (lib.mkIf cfg.integrations.claude-code.enable {
        home.file = {
          ".claude/RTK.md" = {
            text = rtkInstructions;
            force = true;
          };
          ".claude/CLAUDE.md" = {
            text = "@RTK.md\n";
            force = true;
          };
        };
      })
    ]
  );
}
