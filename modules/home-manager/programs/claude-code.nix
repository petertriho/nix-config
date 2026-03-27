{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.claude-code;

  pluginDirFlags = lib.concatMapStringsSep " " (
    dir: "--plugin-dir ${lib.escapeShellArg (toString dir)}"
  ) cfg.pluginDirs;

  pluginDirsPackage = pkgs.symlinkJoin {
    name = "claude-code-with-plugin-dirs";
    paths = [ cfg.finalPackage ];
    postBuild = ''
      mv $out/bin/claude $out/bin/.claude-wrapped
      cat > $out/bin/claude <<EOF
      #! ${pkgs.bash}/bin/bash -e
      exec -a "\$0" "$out/bin/.claude-wrapped" ${pluginDirFlags} "\$@"
      EOF
      chmod +x $out/bin/claude
    '';
    inherit (cfg.finalPackage) meta;
  };
in
{
  options.programs.claude-code.pluginDirs = lib.mkOption {
    type = lib.types.listOf (
      lib.types.oneOf [
        lib.types.path
        lib.types.str
      ]
    );
    default = [ ];
    example = lib.literalExpression ''
      [
        "${pkgs.plannotator}/share/plannotator/apps/hook"
        "${pkgs.superpowers}/share/superpowers"
      ]
    '';
    description = ''
      Additional Claude Code plugin root directories to load via repeated `--plugin-dir` flags.
    '';
  };

  config = lib.mkIf (cfg.enable && cfg.package != null && cfg.pluginDirs != [ ]) {
    home.packages = [ (lib.hiPrio pluginDirsPackage) ];
  };
}
