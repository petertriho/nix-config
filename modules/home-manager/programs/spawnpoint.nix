{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.spawnpoint;
in
{
  options.programs.spawnpoint = {
    enable = lib.mkEnableOption "spawnpoint multi-repo worktree workspaces";
    package = lib.mkPackageOption pkgs "spawnpoint" { };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    # spawnpoint hardcodes ~/.spawnpoint (not XDG). Out-of-store symlinks, not
    # `.text`, because the CLI writes both files: `sp template save|delete`
    # rewrites templates.toml, and `sp init` / `sp config --reset` rewrite
    # config.toml. Both use Path.write_text, which follows the symlink, so
    # edits land in dotfiles/ and stay reviewable in git.
    home.file = {
      ".spawnpoint/config.toml".source =
        config.lib.meta.mkDotfilesSymlink "spawnpoint/.spawnpoint/config.toml";
      ".spawnpoint/templates.toml".source =
        config.lib.meta.mkDotfilesSymlink "spawnpoint/.spawnpoint/templates.toml";
    };

    # Declarative equivalent of `sp init`'s shell integration, ported from
    # upstream's _FISH_SNIPPET. Shadows the `sp` binary in fish, which is the
    # point: bare `sp` creates and cds, `sp list` picks and cds.
    # `functions.<name>` takes a bare string body here, matching the grc
    # functions in home/programs/fish.nix.
    programs.fish.functions.sp = ''
      set -l cmd (test (count $argv) -gt 0; and echo $argv[1]; or echo create)
      set -l rest $argv[2..]
      set -l cd_file "$HOME/.spawnpoint/.cd_path"
      rm -f $cd_file
      switch $cmd
          case create
              ${lib.getExe cfg.package} create $rest
          case list ls
              ${lib.getExe cfg.package} list --cd $rest
          case '*'
              ${lib.getExe cfg.package} $cmd $rest
      end
      if test -f $cd_file
          set -l dir (cat $cd_file)
          rm -f $cd_file
          test -n "$dir"; and cd $dir
      end
    '';

    programs.ai.skills.spawnpoint.source = "${cfg.package}/share/spawnpoint/skills/spawnpoint";

    # Narrow on purpose. This covers `spawnpoint repos|list|template show` and
    # entering an existing workspace. `create`/`add`/`cleanup` run
    # `git worktree add`, which writes into each parent repo's .git under
    # ~/Projects and ~/Work — granting that to every profile would hand each
    # sandboxed agent write access to all 50 repos, so it stays a per-run grant.
    programs.nono.sharedFilesystem = {
      allow = [ "$HOME/.spawnpoint" ];
      read_file = [
        "$HOME/.spawnpoint/config.toml"
        "$HOME/.spawnpoint/templates.toml"
      ];
    };
  };
}
