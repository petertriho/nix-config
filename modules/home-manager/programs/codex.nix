{
  config,
  lib,
  ...
}:
let
  cfg = config.programs.codex;
in
{
  config = lib.mkIf cfg.enable {
    programs.codex = {
      # Merge the declared settings into a writable config.toml, so Codex can still save
      # runtime keys. Nix values take precedence. Comments in the file are not kept.
      mutableSettings = true;
      settings = {
        theme = "ansi";
        personality = "pragmatic";
        features.multi_agent = true;
        tui.status_line = [
          "model-with-reasoning"
          "context-remaining"
          "context-window-size"
          "five-hour-limit"
          "weekly-limit"
          "total-input-tokens"
          "total-output-tokens"
          "used-tokens"
          "current-dir"
        ];
      };
    };
  };
}
