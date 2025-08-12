{
  pkgs,
  config,
  ...
}:
{
  home = {
    packages = with pkgs; [
      aider-chat
      ccusage
      claude-code
      gemini-cli
      goose-cli
      opencode
      plandex
    ];
    file = {
      ".aider.conf.yml".source = config.lib.meta.mkDotfilesSymlink "aider/.aider.conf.yml";
      ".aider.model.settings.yml".source =
        config.lib.meta.mkDotfilesSymlink "aider/.aider.model.settings.yml";
    };
  };
  xdg.configFile = {
    "opencode/opencode.json".source =
      config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/opencode.json";
    "opencode/agent/".source = config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/agent/";
  };
}
