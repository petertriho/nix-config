{ config, ... }:
{
  home.sessionPath = [ "$HOME/.local/bin" ];

  home.file.".local/bin".source = config.lib.meta.mkDotfilesSymlink "scripts/.local/bin";
  xdg.configFile = {
    "fish/completions/nixcfg.fish".source =
      config.lib.meta.mkDotfilesSymlink "scripts/.config/fish/completions/nixcfg.fish";
    "fish/completions/nix-direnv-helper.fish".source =
      config.lib.meta.mkDotfilesSymlink "scripts/.config/fish/completions/nix-direnv-helper.fish";
  };
}
