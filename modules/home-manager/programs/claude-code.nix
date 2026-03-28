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

  options.programs.claude-code.zai.enable =
    lib.mkEnableOption "Z.ai Anthropic-compatible endpoint for Claude Code";

  config = lib.mkMerge [
    (lib.mkIf (cfg.enable && cfg.package != null && cfg.pluginDirs != [ ]) {
      home.packages = [ (lib.hiPrio pluginDirsPackage) ];
    })

    (lib.mkIf (cfg.enable && cfg.zai.enable) {
      home.sessionVariables = {
        ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic";
        API_TIMEOUT_MS = "3000000";
        ANTHROPIC_DEFAULT_HAIKU_MODEL = "glm-5-turbo";
        ANTHROPIC_DEFAULT_SONNET_MODEL = "glm-4.7";
        ANTHROPIC_DEFAULT_OPUS_MODEL = "glm-5.1";
      };
    })
  ];
}
