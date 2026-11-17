{
  pkgs,
  config,
  lib,
  ...
}:
let
  mcpServerPackages = [
    # pkgs.mcp-servers.context7-mcp
  ];
  llmAgents = with pkgs.llm-agents; [
    pi-acp
    tokscale
    # docker-sbx
    # terminal-browser
    # openspec
    # zat # code outline viewer
  ];
in
{
  home = {
    packages =
      with pkgs;
      [
        nodejs
        python3
        python3Packages.tiktoken
        strix
        # tokscale
      ]
      ++ mcpServerPackages
      ++ llmAgents;
    file = {
      ".config/opencode/plugins/skills-sidebar.tsx".source =
        config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/plugins/skills-sidebar.tsx";
    };
    sessionVariables = {
      OPENSPEC_TELEMETRY = 0;
    };
  };
  programs = {
    ai.lsp = {
      bashls = {
        command = "bash-language-server";
        args = [ "start" ];
        filetypes = [
          "sh"
          "bash"
        ];
      };
      # basedpyright = {
      #   command = "basedpyright-langserver";
      #   args = [
      #     "--stdio"
      #   ];
      #   filetypes = [
      #     "python"
      #     "pyi"
      #   ];
      # };
      eslint = {
        command = "vscode-eslint-language-server";
        args = [ "--stdio" ];
        filetypes = [
          "javascript"
          "javascriptreact"
          "typescript"
          "typescriptreact"
          "vue"
          "svelte"
        ];
        # pi-lens runs eslint natively (dispatch runner, config-gated) and has
        # no eslint LSP built-in; as a custom server it would also be tried
        # before tsgo (first-match, alphabetical), hijacking TS navigation.
        clients.pi.enable = false;
      };
      lua-lsp = {
        command = "lua-language-server";
        args = [ ];
        filetypes = [ "lua" ];
      };
      # Plain nixd: agents start servers with a static command, and nixd reads per-repo
      # settings only through `workspace/configuration`. Neovim adds those settings itself.
      nixd = {
        command = "nixd";
        args = [ ];
        filetypes = [ "nix" ];
      };
      pyrefly = {
        command = "pyrefly";
        args = [ "lsp" ];
        filetypes = [
          "python"
          "pyi"
        ];
      };
      terraformls = {
        command = "terraform-ls";
        args = [
          "serve"
        ];
        filetypes = [
          "terraform"
          "tf"
        ];
      };
      tsc = {
        command = "tsc";
        args = [
          "--lsp"
          "--stdio"
        ];
        filetypes = [
          "javascript"
          "javascriptreact"
          "typescript"
          "typescriptreact"
        ];
      };
      # vtsls = {
      #   command = "vtsls";
      #   args = [ "--stdio" ];
      #   filetypes = [
      #     "javascript"
      #     "javascriptreact"
      #     "typescript"
      #     "typescriptreact"
      #   ];
      # };
    };
    mcp = {
      enable = true;
      servers = {
        # atlassian = {
        #   url = "https://mcp.atlassian.com/v1/sse";
        #   type = "sse";
        #   headers = {
        #     Authorization = "Bearer {env:ATLASSIAN_API_TOKEN}";
        #   };
        #   disabled = true;
        # };
        # ck = {
        #   command = "ck";
        #   args = [ "--serve" ];
        #   disabled = true;
        # };
      };
    };
    claude-code = {
      enable = lib.mkDefault false;
      package = pkgs.llm-agents.claude-code;
      enableMcpIntegration = true;
    };
    codex = {
      enable = true;
      package = pkgs.llm-agents.codex;
      enableMcpIntegration = false;
    };
    opencode = {
      enable = true;
      # package = pkgs.unstable.opencode;
      package = pkgs.llm-agents.opencode;
      enableMcpIntegration = true;
      settings = {
        autoshare = false;
        autoupdate = false;
        # snapshot = false;
        lsp = {
          lua-ls.disabled = true;
          pyright.disabled = true;
          typescript.disabled = true;
        };
        small_model = "openai/gpt-6-luna";
        plugin = [
          # "@bastiangx/opencode-unmoji"
          "@franlol/opencode-md-table-formatter"
          # "@mohak34/opencode-notifier"
          # "@slkiser/opencode-quota"
          # "@tarquinen/opencode-dcp"
        ];
        agent = {
          plan = {
            model = "{env:OPENCODE_AGENT_PLAN_MODEL}";
            permission = {
              edit = {
                "*" = "deny";
                ".artifacts/**" = "allow";
              };
            };
          };
          build = {
            model = "{env:OPENCODE_AGENT_BUILD_MODEL}";
            permission = {
              external_directory = {
                "/nix/store/**" = "allow";
              };
              read = {
                "/nix/store/**" = "allow";
              };
              glob = {
                "/nix/store/**" = "allow";
              };
            };
          };
        };
        experimental = {
          quotaToast = {
            enableToast = false;
            formatStyle = "grouped";
            onlyCurrentModel = true;
          };
        };
      };
      tui = {
        plugin = [
          "./plugins/skills-sidebar.tsx"
          "@ishaksebsib/opencode-tree"
          # "@slkiser/opencode-quota"
          #   "oc-tps"
        ];
      };
    };
    pi-coding-agent = {
      enable = true;
      package = pkgs.llm-agents.pi;
    };
    # Each profile only names the agent it wraps; the grants it needs are
    # contributed by the modules that own the underlying files.
    nono = {
      enable = true;
      # Tracked target of the `skills-sidebar.tsx` symlink declared above.
      agentFilesystem.opencode.read = [
        "$HOME/.nix-config/dotfiles/opencode/.config/opencode/plugins"
      ];
      profiles = {
        claude-nix = lib.mkIf config.programs.claude-code.enable {
          agent = "claude";
          extends = "nono-claude-base";
          description = "Claude profile with read access to out-of-store Nix configuration targets";
          abbr = "nnc";
        };
        pi-nix = {
          agent = "pi";
          extends = "nono-pi-base";
          description = "Pi profile with minimal access to out-of-store Nix configuration targets";
          abbr = "nnp";
        };
        opencode-nix = {
          agent = "opencode";
          extends = "nono-opencode-base";
          description = "OpenCode profile with read access to out-of-store Nix configuration targets";
          abbr = "nno";
        };
      };
    };
    agents.skills.enable = true;
    anthropic-skills = {
      enable = true;
      skills = [
        "skill-creator"
      ];
    };
    autoresearch.enable = true;
    bladebro.enable = true;
    donsetch.enable = true;
    effective-html.enable = true;
    elephant-goldfish-model.enable = true;
    hallmark.enable = true;
    impeccable.enable = true;
    jscpd.enable = true;
    modern-web-guidance.enable = true;
    # Orca and Paseo skills both claim handoff and delegation requests. Each of
    # these skills runs only when the user names its tool, so a plain
    # "handoff" goes to the `handoff` skill. The Orca app and module are
    # enabled per profile.
    orca.skillDescriptions = {
      orca-cli = ''Operate Orca-managed worktrees, folder contexts, terminals, repos, automations, worktree comments, and Orca's embedded browser through the `orca` CLI. Use only when the user names Orca or the task involves Orca state, such as "$orca-cli", "Orca worktree", "Orca child worktree", "spawn codex/claude in an Orca worktree", "read/wait/send Orca terminal", "Orca handoff", "hand this to an Orca agent", or "Orca browser". Also use for opening, testing, screenshotting, or checking how a local or external web page renders while working in Orca, unless the user or project names another browser tool; plain HTTP or API calls (curl, fetch) do not need it. Prefer it over raw git worktree, ad hoc PTYs, or Computer Use when Orca state is involved. Do not use it for a handoff request that does not name Orca.'';
      orchestration = ''Run work in separate Orca worker agents and get their results back. Use only when the user names Orca, such as "Orca worker" or "have an Orca Codex worker review this and report back", or asks for Orca supervision (monitor, task DAGs, ask/reply, decision gates). Also use when you are a dispatched Orca worker (a prompt with Task and Dispatch IDs: ask, worker_done). Otherwise prefer your own subagents, including for long or parallel work. Use `orca-cli` for an Orca handoff with nothing expected back, and for Orca terminal control, worktree management, and reading or waiting on Orca terminals.'';
    };
    paseo = {
      enable = true;
      skillDescriptions = {
        paseo-advisor = ''Spin up a single Paseo agent as an advisor for a second opinion on the current task. Use only when the user names Paseo, such as "Paseo advisor" or "ask a Paseo agent what it thinks", and wants an outside take without delegating the work itself.'';
        paseo-committee = ''Form a committee of two high-reasoning Paseo agents to step back, do root cause analysis, and produce a plan. Use only when the user names Paseo, such as "Paseo committee", for example when stuck, looping, tunnel-visioning, or facing a hard planning problem.'';
        paseo-handoff = ''Hand off the current task to a Paseo agent with full context. Use only when the user names Paseo, such as "Paseo handoff" or "hand this to a Paseo agent". Do not use it for a handoff request that does not name Paseo.'';
      };
      settings = {
        daemon = {
          autoArchiveAfterMerge = true;
          browserTools.enabled = true;
          mcp.injectIntoAgents = true;
        };
        agents.providers = {
          antigravity.enabled = false;
          codex.enabled = false;
          copilot.enabled = false;
          muse.enabled = false;
          opencode.enabled = false;
        };
        features.webUi.enabled = true;
      };
    };
    plannotator.enable = true;
    playwriter.enable = false;
    portless.enable = true;
    rea.enable = lib.mkDefault false;
    repowise.enable = false;
    spawnpoint.enable = false;
    superpowers.enable = false;
    taste-skill = {
      enable = false;
      skills = [
        "taste-skill"
        "gpt-tasteskill"
        "image-to-code-skill"
        "redesign-skill"
        "soft-skill"
        "output-skill"
        "minimalist-skill"
        "brutalist-skill"
        "stitch-skill"
        "imagegen-frontend-web"
        "imagegen-frontend-mobile"
        "brandkit"
      ];
    };
    terraform-skill.enable = false;
    workmux.enable = true;
    write-better.enable = true;
  };
  xdg.configFile = { };
  # // lib.mapAttrs' (
  #   name: _:
  #   lib.nameValuePair "opencode/agents/${name}" {
  #     source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/agents/${name}";
  #   }
  # ) (builtins.readDir ../../dotfiles/opencode/.config/opencode/agents)
  # // lib.mapAttrs' (
  #   name: _:
  #   lib.nameValuePair "opencode/skills/${name}" {
  #     source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/skills/${name}";
  #   }
  # ) (builtins.readDir ../../dotfiles/opencode/.config/opencode/skills);
}
