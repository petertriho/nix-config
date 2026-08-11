{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.nono;
  jsonFormat = pkgs.formats.json { };

  # nono's `filesystem` block, split by access level. Every key is a list so
  # that unrelated modules can each contribute the paths they own.
  #
  # Naming the right path for a Home Manager out-of-store symlink matters, and
  # getting it wrong fails silently. nono resolves the granted path itself, but
  # does not follow symlinks it finds underneath that path:
  #
  #   * A link to a file or to a whole directory can be named directly
  #     (`$HOME/.claude/settings.json`, `$HOME/.gittemplates`). The tracked
  #     target is granted with it, so the grant survives moves in `dotfiles/`.
  #   * A real directory holding per-entry links (`$HOME/.config/git`,
  #     `$HOME/.agents/skills`) only gets traversal that way, so name the
  #     tracked target directory (`$HOME/.nix-config/dotfiles/...`) instead.
  #     Add the `$HOME` path back only when nothing else grants traversal: the
  #     base profiles already cover their own agent's directories, which is why
  #     `~/.config/git` needs listing to be granted but `~/.agents/skills`
  #     does not.
  #
  # Verify from a directory outside `~/.nix-config`: `--allow-cwd` grants the
  # whole repository, which hides every missing target grant.
  grantKeys = [
    "allow"
    "allow_file"
    "read"
    "read_file"
    "suppress_save_prompt"
  ];

  grantSubmodule = lib.types.submodule {
    options = lib.genAttrs grantKeys (
      key:
      lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Paths merged into the generated profile's `filesystem.${key}`.";
      }
    );
  };

  # Grants that apply to a profile: the shared set, the set contributed for its
  # agent, and its own extras. Empty lists are dropped so the generated JSON
  # only carries grants that were actually asked for.
  profileFilesystem =
    profile:
    lib.filterAttrs (_: paths: paths != [ ]) (
      lib.genAttrs grantKeys (
        key:
        lib.unique (
          cfg.sharedFilesystem.${key}
          ++ (cfg.agentFilesystem.${profile.agent} or { }).${key} or [ ]
          ++ profile.filesystem.${key}
        )
      )
    );

  mkProfileJson = name: profile: {
    inherit (profile) extends;
    meta = {
      inherit name;
      inherit (profile) description;
    };
    filesystem = profileFilesystem profile;
  };

  fishCompletion = pkgs.runCommand "nono.fish" { } ''
    HOME="$TMPDIR" ${cfg.package}/bin/nono completion fish > "$out"
  '';
in
{
  options.programs.nono = {
    enable = lib.mkEnableOption "nono capability-based sandbox";
    package = lib.mkPackageOption pkgs.llm-agents "nono" {
      pkgsText = "pkgs.llm-agents";
    };

    # The immutable Nix derivation that ships the pinned Claude, Pi, and
    # OpenCode packs plus the generated local base profiles. Moving this
    # commit/hash/version updates all three packs atomically. `nono update`
    # and the `nnu` abbreviation do NOT touch these packs — they are no longer
    # registry-managed.
    agentPacksPackage = lib.mkPackageOption pkgs "nono-packs" {
      extraDescription = ''
        The package providing the pinned `nolabs-ai` agent packs and their
        generated local base profiles.
      '';
    };

    sharedFilesystem = lib.mkOption {
      type = grantSubmodule;
      default = { };
      description = ''
        Grants merged into every generated profile, for tooling each harness
        runs regardless of which agent it is (git, workmux, and similar).
      '';
    };

    agentFilesystem = lib.mkOption {
      type = lib.types.attrsOf grantSubmodule;
      default = { };
      example = lib.literalExpression ''
        { claude.read_file = [ "$HOME/.claude/settings.json" ]; }
      '';
      description = ''
        Grants merged into every profile whose `agent` matches the attribute
        name. This is the seam that lets a module declare sandbox access beside
        the file it creates, rather than naming a profile it does not own.
      '';
    };

    profiles = lib.mkOption {
      default = { };
      description = "Profiles written to `$XDG_CONFIG_HOME/nono/profiles`.";
      type = lib.types.attrsOf (
        lib.types.submodule (
          { config, ... }:
          {
            options = {
              agent = lib.mkOption {
                type = lib.types.str;
                example = "claude";
                description = "Which `agentFilesystem` bucket this profile draws from.";
              };
              extends = lib.mkOption {
                type = lib.types.str;
                example = "nolabs-ai/claude";
                description = "Profile this one inherits from.";
              };
              description = lib.mkOption {
                type = lib.types.str;
                description = "Profile description, recorded in its `meta` block.";
              };
              filesystem = lib.mkOption {
                type = grantSubmodule;
                default = { };
                description = "Grants specific to this profile.";
              };
              command = lib.mkOption {
                type = lib.types.str;
                defaultText = lib.literalExpression "config.agent";
                description = "Command the generated fish abbreviation launches.";
              };
              abbr = lib.mkOption {
                type = lib.types.nullOr lib.types.str;
                default = null;
                example = "cn";
                description = "Fish abbreviation running this profile, or null for none.";
              };
            };
            config.command = lib.mkDefault config.agent;
          }
        )
      );
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    # A saved grant would replace the store symlink below with a mutable copy,
    # and a saved `~/` overlaps nono's own state root and makes the profile
    # unloadable. These profiles are declarative, so never let that happen.
    programs.nono.sharedFilesystem.suppress_save_prompt = [ "~/" ];

    xdg.configFile = {
      "fish/completions/nono.fish".source = fishCompletion;
    }
    // lib.mapAttrs' (
      name: profile:
      lib.nameValuePair "nono/profiles/${name}.json" {
        source = jsonFormat.generate "${name}.json" (mkProfileJson name profile);
      }
    ) cfg.profiles
    // {
      # Declarative base profiles generated by the pinned pack derivation.
      # Loaded as ordinary user profiles (not registry packs), so they do not
      # trigger pack lockfile / trust-bundle verification.
      "nono/profiles/nono-claude-base.json".source =
        "${cfg.agentPacksPackage}/share/nono-packs/profiles/nono-claude-base.json";
      "nono/profiles/nono-pi-base.json".source =
        "${cfg.agentPacksPackage}/share/nono-packs/profiles/nono-pi-base.json";
      "nono/profiles/nono-opencode-base.json".source =
        "${cfg.agentPacksPackage}/share/nono-packs/profiles/nono-opencode-base.json";

      # OpenCode pack wiring: previously registry-managed symlinks, now
      # immutable links into the pack derivation.
      "opencode/plugins/nono-sandbox.ts".source =
        "${cfg.agentPacksPackage}/share/nono-packs/packs/opencode/plugin/nono-sandbox.ts";
      "opencode/skills/nono-sandbox".source =
        "${cfg.agentPacksPackage}/share/nono-packs/packs/opencode/skills/nono-sandbox";
    };

    programs.fish.shellAbbrs = lib.mapAttrs' (
      name: profile: lib.nameValuePair profile.abbr "nono-agent-run ${name} ${profile.command}"
    ) (lib.filterAttrs (_: profile: profile.abbr != null) cfg.profiles);

    # Claude Code 2.1.157+ loads Home Manager plugins as persistent personal
    # plugins. This avoids marketplace, cache, and shared mutable metadata wiring.
    programs.claude-code.plugins = lib.mkIf config.programs.claude-code.enable {
      nono-sandbox = "${cfg.agentPacksPackage}/share/nono-packs/packs/claude";
    };
  };
}
