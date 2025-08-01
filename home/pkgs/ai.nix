{
  pkgs,
  config,
  ...
}:
{
  home.packages = with pkgs; [
    aider-chat
    gemini-cli
    opencode
  ];

  xdg.configFile."opencode/opencode.json".source =
    config.lib.meta.mkDotfilesSymlink "opencode/.config/opencode/opencode.json";
}
