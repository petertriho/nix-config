{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.lean-ctx;
  assets = pkgs.lean-ctx-assets;
in
{
  options.programs.lean-ctx = {
    enable = lib.mkEnableOption "lean-ctx context runtime for AI agents";
  };

  config = lib.mkIf cfg.enable {
    # The binary itself (unwrapped). The bash hook only activates when
    # `command -v lean-ctx` succeeds, so it must be on PATH.
    home.packages = [ pkgs.llm-agents.lean-ctx ];

    # Runtime config as an editable dotfile + a stable hook path so claude-code's
    # static settings.json can reference ~/.config/lean-ctx/env.sh (a dotfile
    # can't hold a store hash).
    xdg.configFile."lean-ctx/config.toml".source =
      config.lib.meta.mkDotfilesSymlink "lean-ctx/.config/lean-ctx/config.toml";
    xdg.configFile."lean-ctx/env.sh".source = "${assets}/env.sh";

    # Shared MCP server — flows to both claude-code and opencode via their
    # enableMcpIntegration. HM owns MCP; lean-ctx's own MCP writes are discarded.
    #
    # LEAN_CTX_HEADLESS=1 starts the MCP server in "headless" mode: it serves the
    # ctx_* tools but skips ALL auto-setup (no hook installation, no rules/CLAUDE.md
    # injection, no agent-registry writes). Without this, lean-ctx re-injects the
    # PreToolUse rewrite/redirect hooks into ~/.claude/settings.json (with absolute
    # store paths) every time claude-code spawns it. The PATH-based hooks in the
    # settings.json dotfile still fire at runtime — headless only stops the
    # *installation*, not the `lean-ctx hook …` subcommands. HM owns every config
    # file, so this is the correct mode. https://leanctx.com/docs/configuration/
    programs.mcp.servers.lean-ctx = {
      command = "${pkgs.llm-agents.lean-ctx}/bin/lean-ctx";
      env.LEAN_CTX_HEADLESS = "1";
    };

    # claude-code: generated rules + skill. ~/.claude/CLAUDE.md is owned
    # outright here (user has none).
    home.file.".claude/CLAUDE.md".source = "${assets}/claude/CLAUDE.md";
    home.file.".claude/skills/lean-ctx".source = "${assets}/claude/skills/lean-ctx";

    # claude-code scopes its bash hook via CLAUDE_ENV_FILE. claude-code applies
    # settings.json `env` values literally (no ~/$HOME expansion — verified), and
    # a shared dotfile can't hold a per-host absolute path, so deliver the path
    # via sessionVariables: Nix interpolates homeDirectory at build time → a real
    # absolute path on every host. Only claude-code reads CLAUDE_ENV_FILE, so it
    # is inert in fish/interactive bash (this deliberately relaxes the original
    # "no lean-ctx vars in sessionVariables" rule for this one var).
    home.sessionVariables.CLAUDE_ENV_FILE =
      lib.mkIf config.programs.claude-code.enable
        "${config.home.homeDirectory}/.config/lean-ctx/env.sh";

    # opencode: generated rules. The opencode HM module only writes AGENTS.md
    # when programs.opencode.context is set, so this is the sole definition.
    xdg.configFile."opencode/AGENTS.md".source = "${assets}/opencode/AGENTS.md";

    # opencode has no env-injection for its bash tool, so scope the hook via a
    # shell wrapper (LEAN_CTX_AGENT drives _lc_is_agent(); BASH_ENV loads the
    # hook). Fish and all other bash stay untouched — no sessionVariables.
    programs.opencode.settings.shell =
      lib.mkIf config.programs.opencode.enable "${assets}/opencode-shell";
  };
}
